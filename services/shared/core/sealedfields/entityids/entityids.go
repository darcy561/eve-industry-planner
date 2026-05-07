package entityids

import (
	"encoding/json"
	"strconv"

	corecrypto "eve-industry-planner/shared/core/crypto"
	"eve-industry-planner/shared/core/sealedfields"
	"eve-industry-planner/shared/shared/models"
)

const (
	Domain         = "entity_ids"
	PayloadVersion = 1
)

var EntityIDsFields = []string{
	"build.sale.transactions[*].corporation_id",
	"build.sale.transactions[*].character_id",
	"build.sale.marketOrders[*].corporation_id",
	"build.sale.marketOrders[*].character_id",
	"build.costs.linkedJobs[*].corporation_id",
	"build.costs.linkedJobs[*].character_id",
}

type lineIdentity struct {
	Corp *int `json:"corp,omitempty"`
	Char *int `json:"char,omitempty"`
}

type payload struct {
	Tx  map[string]lineIdentity `json:"tx,omitempty"`
	Ord map[string]lineIdentity `json:"ord,omitempty"`
	Ind map[string]lineIdentity `json:"ind,omitempty"`
}

func parsePayload(plaintext []byte) (payload, error) {
	var p payload
	if len(plaintext) == 0 {
		return p, nil
	}
	if err := json.Unmarshal(plaintext, &p); err != nil {
		return p, err
	}
	return p, nil
}

func intPtrOrNil(v int) *int {
	if v <= 0 {
		return nil
	}
	x := v
	return &x
}

func Build(orders []models.MarketOrder, transactions []models.Transaction, linkedJobs []models.LinkedESIJob) ([]byte, error) {
	p := payload{}

	for _, t := range transactions {
		if t.TransactionID == 0 {
			continue
		}
		corp := intPtrOrNil(t.CorporationID)
		char := intPtrOrNil(t.CharacterID)
		if corp == nil && char == nil {
			continue
		}
		if p.Tx == nil {
			p.Tx = map[string]lineIdentity{}
		}
		p.Tx[strconv.FormatInt(t.TransactionID, 10)] = lineIdentity{Corp: corp, Char: char}
	}

	for _, o := range orders {
		if o.OrderID == 0 {
			continue
		}
		corp := intPtrOrNil(o.CorporationID)
		char := intPtrOrNil(o.CharacterID)
		if corp == nil && char == nil {
			continue
		}
		if p.Ord == nil {
			p.Ord = map[string]lineIdentity{}
		}
		p.Ord[strconv.Itoa(o.OrderID)] = lineIdentity{Corp: corp, Char: char}
	}

	for _, lj := range linkedJobs {
		if lj.JobID == 0 {
			continue
		}
		corp := intPtrOrNil(lj.CorporationID)
		char := intPtrOrNil(lj.CharacterID)
		if corp == nil && char == nil {
			continue
		}
		if p.Ind == nil {
			p.Ind = map[string]lineIdentity{}
		}
		p.Ind[strconv.Itoa(lj.JobID)] = lineIdentity{Corp: corp, Char: char}
	}

	return json.Marshal(p)
}

func Apply(plaintext []byte, job *models.Job) error {
	if job == nil || len(plaintext) == 0 {
		return nil
	}
	p, err := parsePayload(plaintext)
	if err != nil {
		return err
	}

	for i := range job.Build.Sale.Transactions {
		k := strconv.FormatInt(job.Build.Sale.Transactions[i].TransactionID, 10)
		if v, ok := p.Tx[k]; ok {
			if v.Corp != nil {
				job.Build.Sale.Transactions[i].CorporationID = *v.Corp
			}
			if v.Char != nil {
				job.Build.Sale.Transactions[i].CharacterID = *v.Char
			}
		}
	}

	orderIdentity := map[int]lineIdentity{}
	for i := range job.Build.Sale.MarketOrders {
		k := strconv.Itoa(job.Build.Sale.MarketOrders[i].OrderID)
		if v, ok := p.Ord[k]; ok {
			orderIdentity[job.Build.Sale.MarketOrders[i].OrderID] = v
			if v.Corp != nil {
				job.Build.Sale.MarketOrders[i].CorporationID = *v.Corp
			}
			if v.Char != nil {
				job.Build.Sale.MarketOrders[i].CharacterID = *v.Char
			}
		}
	}

	for i := range job.Build.Costs.LinkedJobs {
		k := strconv.Itoa(job.Build.Costs.LinkedJobs[i].JobID)
		if v, ok := p.Ind[k]; ok {
			if v.Corp != nil {
				job.Build.Costs.LinkedJobs[i].CorporationID = *v.Corp
			}
			if v.Char != nil {
				job.Build.Costs.LinkedJobs[i].CharacterID = *v.Char
			}
		}
	}

	for i := range job.Build.Sale.BrokersFee {
		v, ok := orderIdentity[job.Build.Sale.BrokersFee[i].OrderID]
		if !ok {
			continue
		}
		if v.Corp != nil {
			job.Build.Sale.BrokersFee[i].CorporationID = *v.Corp
		}
		if v.Char != nil {
			job.Build.Sale.BrokersFee[i].CharacterID = *v.Char
		}
	}

	return nil
}

func LinkedJobCorporationsFromPlaintext(plaintext []byte) (map[int]int, error) {
	p, err := parsePayload(plaintext)
	if err != nil {
		return nil, err
	}
	out := map[int]int{}
	for jobID, identity := range p.Ind {
		if identity.Corp == nil || *identity.Corp <= 0 {
			continue
		}
		id, convErr := strconv.Atoi(jobID)
		if convErr != nil || id <= 0 {
			continue
		}
		out[id] = *identity.Corp
	}
	return out, nil
}

func TransactionCorporationsFromPlaintext(plaintext []byte) (map[int64]int, error) {
	p, err := parsePayload(plaintext)
	if err != nil {
		return nil, err
	}
	out := map[int64]int{}
	for txID, identity := range p.Tx {
		if identity.Corp == nil || *identity.Corp <= 0 {
			continue
		}
		id, convErr := strconv.ParseInt(txID, 10, 64)
		if convErr != nil || id <= 0 {
			continue
		}
		out[id] = *identity.Corp
	}
	return out, nil
}

func OrderCorporationsFromPlaintext(plaintext []byte) (map[int]int, error) {
	p, err := parsePayload(plaintext)
	if err != nil {
		return nil, err
	}
	out := map[int]int{}
	for orderID, identity := range p.Ord {
		if identity.Corp == nil || *identity.Corp <= 0 {
			continue
		}
		id, convErr := strconv.Atoi(orderID)
		if convErr != nil || id <= 0 {
			continue
		}
		out[id] = *identity.Corp
	}
	return out, nil
}

func Strip(job *models.Job) {
	if job == nil {
		return
	}
	for i := range job.Build.Sale.Transactions {
		job.Build.Sale.Transactions[i].CorporationID = 0
		job.Build.Sale.Transactions[i].CharacterID = 0
	}
	for i := range job.Build.Sale.MarketOrders {
		job.Build.Sale.MarketOrders[i].CorporationID = 0
		job.Build.Sale.MarketOrders[i].CharacterID = 0
	}
	for i := range job.Build.Costs.LinkedJobs {
		// Legacy persisted field must be stripped explicitly.
		job.Build.Costs.LinkedJobs[i].CorporationID = 0
		job.Build.Costs.LinkedJobs[i].CharacterID = 0
	}
	for i := range job.Build.Sale.BrokersFee {
		job.Build.Sale.BrokersFee[i].CorporationID = 0
		job.Build.Sale.BrokersFee[i].CharacterID = 0
	}
}

type JobIdentitySealer struct {
	keyring *corecrypto.Keyring
}

func NewJobIdentitySealer(keyring *corecrypto.Keyring) *JobIdentitySealer {
	return &JobIdentitySealer{keyring: keyring}
}

func (s *JobIdentitySealer) SealJobIdentity(doc *models.Job) error {
	if doc == nil {
		return nil
	}
	if !hasAnyIdentity(doc) {
		Strip(doc)
		return nil
	}
	plaintext, err := Build(doc.Build.Sale.MarketOrders, doc.Build.Sale.Transactions, doc.Build.Costs.LinkedJobs)
	if err != nil {
		return err
	}
	sealed, err := sealedfields.Seal(s.keyring, Domain, PayloadVersion, plaintext, EntityIDsFields)
	if err != nil {
		return err
	}
	doc.Sealed = sealed
	Strip(doc)
	return nil
}

func hasAnyIdentity(doc *models.Job) bool {
	if doc == nil {
		return false
	}
	for _, t := range doc.Build.Sale.Transactions {
		if t.CorporationID > 0 || t.CharacterID > 0 {
			return true
		}
	}
	for _, o := range doc.Build.Sale.MarketOrders {
		if o.CorporationID > 0 || o.CharacterID > 0 {
			return true
		}
	}
	for _, lj := range doc.Build.Costs.LinkedJobs {
		if lj.CorporationID > 0 || lj.CharacterID > 0 {
			return true
		}
	}
	for _, bf := range doc.Build.Sale.BrokersFee {
		if bf.CorporationID > 0 || bf.CharacterID > 0 {
			return true
		}
	}
	return false
}
