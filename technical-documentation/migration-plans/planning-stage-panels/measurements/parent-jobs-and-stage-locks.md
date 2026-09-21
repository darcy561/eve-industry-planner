# What the counts behind Stages P and Q were measured against

Every figure Stages **P** and **Q** quote comes from the queries below. They were run against
`eve_industry_planner_snapshot` — a dump of the **live** database restored into the local dev mongo as
a second database, which is how this repository lets a reader inspect real data without provisioning
remote access. It is a snapshot, so it is real scale at an unstated moment rather than a live reading;
treat the figures as the shape of the data, not as today's totals.

Run with:

```bash
set -a && . ./.env && set +a
C=$(docker ps --format '{{.Names}}' | grep mongo | grep -v proxy | head -1)
docker exec "$C" mongosh --quiet \
  -u "$MONGO_ROOT_USERNAME" -p "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin \
  eve_industry_planner_snapshot --eval '<the script below>'
```

## Parent jobs — what Stage P rests on

```js
const hasP = { $expr: { $gt: [{ $size: { $ifNull: ["$parentJobs", []] } }, 0] } };
const noP  = { $expr: { $eq: [{ $size: { $ifNull: ["$parentJobs", []] } }, 0] } };

db.user_job_documents.countDocuments();                                              // 31,953
db.user_job_documents.countDocuments({ jobStatus: 0 });                              // 24,744
db.user_job_documents.countDocuments({ jobStatus: 0, includedInGroup: true,  ...hasP }); // 12,430
db.user_job_documents.countDocuments({ jobStatus: 0, includedInGroup: false, ...hasP }); //  6,457
db.user_job_documents.countDocuments({ jobStatus: 0, ...noP });                       //  5,857
db.user_job_documents.countDocuments({ jobStatus: 0,
  $expr: { $gt: [{ $size: { $ifNull: ["$parentJobs", []] } }, 1] } });                //  4,391
db.user_job_documents.countDocuments(noP);                                           //  7,325
```

**6,457** is the figure the stage turns on: planning-stage jobs that have parent jobs and are *not* in
a group, which is exactly the set today's `parentJobIDs.length > 0 && includedInGroup` gate excludes.
**7,325** jobs have no parents at all and are still drawn the "Parent Jobs" heading and its scroll box.

### How many parents a job has

```js
const b = {}; let max = 0;
db.user_job_documents.find({}, { parentJobs: 1 }).forEach((d) => {
  const n = (d.parentJobs || []).length;
  if (n > max) max = n;
  const k = n === 0 ? "0" : n === 1 ? "1" : n <= 3 ? "2-3" : n <= 9 ? "4-9" : "10+";
  b[k] = (b[k] || 0) + 1;
});
```

| Parents | Jobs |
|---------|------|
| none | 7,325 |
| one | 18,513 |
| two or three | 4,458 |
| four to nine | 1,340 |
| ten or more | 317 |

The most any job has is **22**. The fold at six rows is set against this: 1,340 jobs sit in the four-to-
nine band and mostly never fold, and the 317 above it are what the fold exists for.

## The locked final stage — what Stage Q rests on

```js
db.user_job_documents.countDocuments({ includedInGroup: true, isReadyToSell: { $ne: true } });          // 19,301
db.user_job_documents.countDocuments({ includedInGroup: true, isReadyToSell: { $ne: true }, ...hasP }); // 16,413
db.user_job_documents.countDocuments({ includedInGroup: true, isReadyToSell: { $ne: true }, ...noP });  //  2,888
db.user_job_documents.countDocuments({ isReadyToSell: true });                                          //     98
```

`isFinalStepLockedForJob` is `includedInGroup && !isReadyToSell`, so **19,301 of 31,953** jobs — 60% —
meet a disabled final step with no reason given. **16,413** of those have parent jobs, and
`SellGroupJobButton` returns `null` for a job with parents, so no control in the app can lift the lock
for them. The remaining **2,888** are grouped jobs without parents, where the control exists. Only
**98** jobs in the whole snapshot are marked ready to sell.

## Stage names — why the tab bar carries arbitrary text

```js
const DEF = { "0": "Planning", "1": "Purchasing", "2": "Building", "3": "Complete", "4": "For Sale" };
let total = 0, custom = 0, lens = [], longest = "", maxLen = 0;
db.application_settings.find({}, { jobStatuses: 1 }).forEach((a) => {
  total++;
  let c = false;
  Object.entries(a.jobStatuses || {}).forEach(([k, v]) => {
    const n = v && v.name;
    if (!n) return;
    lens.push(n.length);
    if (n !== DEF[k]) c = true;
    if (n.length > maxLen) { maxLen = n.length; longest = n; }
  });
  if (c) custom++;
});
```

**34 of 4,822** accounts have renamed at least one stage. Label lengths are **8** at the median, **10**
at the 95th percentile and **29** at the longest — `"Hybrid/Intermediate Materials"`. Five labels of
median length fit a narrow window, so the tab bar scrolls only in the rare long case rather than being
built around it, and no tab is ever labelled by position.

Renamed labels are not always workflow words — the data holds `Capital_core_temps`, `Waiting for Input`,
`Jobs Running`, `Pending Parts` and `Legion Run`, which is why the design treats the label as opaque
text rather than something the frame can abbreviate or infer meaning from.
