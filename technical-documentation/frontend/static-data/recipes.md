# Recipes (`frontend/src/Functions/Static/recipes.js`)

Live SoT for how the SPA reads the way an item is made — its materials, activities, skills and
times: [`frontend/src/Functions/Static/recipes.js`](../../../frontend/src/Functions/Static/recipes.js),
read through [`Functions/Job Build/getItemRecipes.js`](../../../frontend/src/Functions/Job%20Build/getItemRecipes.js).

What is done with a recipe once it is read — building the job, walking its material tree — belongs to
[`Functions/JobPlanner`](../../../frontend/src/Functions/JobPlanner) and is not covered here.

## Why the file is held rather than fetched

Recipes were once fetched from the API per item, and that made building a job from the UI slow: it is
an interactive action a player repeats, and a round trip sat in the middle of it. The file is
downloaded and cached instead, so a build reads from memory.

The API client underneath is still there and still used — see § When the API is asked — but it is
the exception rather than the path.

## Keyed on the way in

`RECIPE_LIST` arrives as a flat array of 4,104 recipes. `primeRecipes` turns it into a map keyed by
item id once, because a job asks for several items at a time and searching the array per item was a
walk of every recipe per item.

Ids are keyed and looked up **as strings**. The file's own ids are numbers, but a caller may hold
either — a material's type id arrives as a number, an id read back off a stored document as a string
— and comparing the raw values sent a string-holding caller to the network for a recipe already in
memory.

## When the API is asked

`getItemRecipes` answers from the file and falls back to `fetchBlueprints` only when it cannot: a
recipe the file does not carry is one published since the build the app holds, which is what the
fallback exists for. Reading the file failing at all — an outage, a cache the browser refused — falls
back the same way.

**A partial answer is never used.** If any requested id is missing, the whole set goes to the API
rather than the found recipes being mixed with fetched ones, so every recipe in one build request
comes from one source and one build of the data.

## Dropping what was primed

`resetRecipes` forgets the map, so the next prime reads the file again. The app refreshes its static
data on a timer and a new SDE build is a different file behind the same key, so
[`useFetchStaticDataFiles`](../../../frontend/src/Hooks/App/useFetchStaticDataFiles.js) calls it when
the build has moved.
