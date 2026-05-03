package conversion

// Decryptor-only dogma: probability / output BPC ME, TE, and max runs. Matches the stat columns
// for decryptors in https://wiki.eveuniversity.org/Invention (optional decryptor item).
var decryptorInventionDogmaAllowlist = []int{
	1112, // inventionPropabilityMultiplier
	1113, // inventionMEModifier
	1114, // inventionTEModifier
	1124, // inventionMaxRunModifier
}

func decryptorDogmaIDSet() map[int]struct{} {
	m := make(map[int]struct{}, len(decryptorInventionDogmaAllowlist))
	for _, id := range decryptorInventionDogmaAllowlist {
		m[id] = struct{}{}
	}
	return m
}

// SDE types.groupID for optional invention decryptors. Matches EVE-IPH (DecryptorList.vb):
// only group 1304 — "Only one Decryptor Group with Phoebe". Excludes Talocan line (735), data
// interfaces (979), cosmic storyline items (728–734), etc.
func isOptionalDecryptorGroup(groupID int) bool {
	return groupID == 1304
}
