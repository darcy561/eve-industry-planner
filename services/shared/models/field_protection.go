package models

// FieldProtection records the protected field set a document was written under,
// so a backfill can select documents built under an older set.
type FieldProtection struct {
	Spec string `bson:"spec" json:"-"`
}
