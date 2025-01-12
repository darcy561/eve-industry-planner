import uuid from "react-uuid";

class WatchlistItem {
  constructor(data) {
    this.id = data?.id || uuid();
    this.version = data?.version || 2;
    this.typeID = data?.typeID;
    this.watchlistGroup = data?.watchlistGroup || 0;
    this.name = data?.name;
    this.quantity = data?.quantity;
  }
}

export default WatchlistItem;
