package documentlock

// Service performs document-lock mutations and reads for a fixed Deps bundle.
type Service struct {
	Deps Deps
}

// NewService returns a lock service. Callers typically use DepsFromServiceClients.
func NewService(d Deps) *Service {
	return &Service{Deps: d}
}
