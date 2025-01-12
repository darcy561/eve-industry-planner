import uuid from "react-uuid";

class WatchlistGroup {
  constructor(data) {
    this.id = data?.id || uuid();
    this.name = data?.name ?? "Unnamed Group";
    this.expanded = data?.expanded ?? true;
    this.version = data?.version ?? 1;
  }

  toDocument() {
    return {
      id: this.id,
      name: this.name,
      expanded: this.expanded,
    };
  }
}
export default WatchlistGroup;
