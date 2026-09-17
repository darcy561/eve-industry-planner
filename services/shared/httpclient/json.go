package httpclient

import (
	"fmt"

	"eve-industry-planner/shared/jsoncodec"
)

// JSON decodes the body into v. A status outside 2xx is returned as a
// *StatusError instead, so a caller need not check twice.
func (r *Response) JSON(v any) error {
	if err := r.Err(); err != nil {
		return err
	}
	if err := jsoncodec.Unmarshal(r.Body, v); err != nil {
		return fmt.Errorf("decode json: %w", err)
	}
	return nil
}
