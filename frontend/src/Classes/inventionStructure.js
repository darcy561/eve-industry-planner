import { jobTypes } from "../Context/defaultValues";
import { customStructureLocationMap } from "../Context/defaultValues";
import DOMPurify from "dompurify";

export default class InventionStructure {
    constructor(existingValue) {
        this.id = existingValue?.id ?? `${customStructureLocationMap[jobTypes.invention]}-${crypto.randomUUID()}`;
        this.jobType = jobTypes.invention;
        this.name = existingValue?.name ?? "";
        this.structureType = existingValue?.structureType ?? 0;
        this.systemType = existingValue?.systemType ?? 0;
        this.rigSlot1 = existingValue?.rigSlot1 ?? 0;
        this.rigSlot2 = existingValue?.rigSlot2 ?? 0;
        this.tax = existingValue?.tax ?? 0;
        this.default = existingValue?.default ?? false;
    }

    setName(name) {
        this.name = DOMPurify.sanitize(name, {
            ALLOWED_TAGS: [],
            ALLOWED_ATTR: [],
        });
    }

    setStructureType(structureType) {
        this.structureType = structureType;
    }

    setSystemType(systemType) {
        this.systemType = systemType;
    }

    setRigSlot1(rigSlot1) {
        this.rigSlot1 = rigSlot1;
    }

    setRigSlot2(rigSlot2) {
        this.rigSlot2 = rigSlot2;
    }

    setTax(tax) {
        this.tax = tax;
    }

    setDefault(isDefault) {
        this.default = isDefault;
    }

    toDocument() {
        return {
            id: this.id,
            jobType: this.jobType,
            name: this.name,
            structureType: this.structureType,
            systemType: this.systemType,
            rigSlot1: this.rigSlot1,
            rigSlot2: this.rigSlot2,
            tax: this.tax,
            default: this.default,
        };
    }
}