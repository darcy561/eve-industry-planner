// Package jobwritecorpus carries the write envelope both sides are tested
// against.
//
// The envelope lives in JSON beside this file because the SPA reads the same
// file to build its writes: a field renamed in Go alone would leave the two
// sides disagreeing about the shape a save travels in, without either failing.
// It is embedded rather than read from disk so a live test carries it into the
// container it runs in, where the repository is not mounted.
package jobwritecorpus

import _ "embed"

//go:embed body.json
var Raw []byte
