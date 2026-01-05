package server

// scanIncomingBulkQueue scans the incoming bulk queue for work
func (s *Server) scanIncomingBulkQueue() {
	// Queue pointer is initialized once and never changes
	if s.incomingBulkQueue != nil && len(s.incomingBulkQueue.ch) > 0 {
		s.incomingPool.SubmitErr(func() error {
			return s.processIncomingBulkQueue()
		})
	}
}
