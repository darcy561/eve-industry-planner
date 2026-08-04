package doclocklogic

// Outcome is a classified WS adapter result (no Server/Client types).
// Success: Err == nil and FailureClass == "".
type Outcome struct {
	Err          error
	Msg          string
	FailureClass string
	Extra        map[string]any
}

func (o Outcome) OK() bool {
	return o.Err == nil && o.FailureClass == ""
}

func fail(msg, failureClass string, err error, extra map[string]any) Outcome {
	if extra == nil && err != nil {
		extra = map[string]any{"error": err.Error()}
	} else if extra == nil {
		extra = map[string]any{}
	} else if err != nil {
		if _, ok := extra["error"]; !ok {
			extra["error"] = err.Error()
		}
	}
	return Outcome{Err: err, Msg: msg, FailureClass: failureClass, Extra: extra}
}
