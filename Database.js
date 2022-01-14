const { MongoClient, ObjectID } = require("mongodb"); // require the mongodb driver

function Database(mongoUrl, dbName) {
  if (!(this instanceof Database)) return new Database(mongoUrl, dbName);
  this.connected = new Promise((resolve, reject) => {
    MongoClient.connect(
      mongoUrl,
      {
        useNewUrlParser: true,
      },
      (err, client) => {
        if (err) reject(err);
        else {
          console.log("[MongoClient] Connected to " + mongoUrl + "/" + dbName);
          resolve(client.db(dbName));
        }
      }
    );
  });
  this.status = () =>
    this.connected.then(
      (db) => ({ error: null, url: mongoUrl, db: dbName }),
      (err) => ({ error: err })
    );
}

Database.prototype.getUser = function (username) {
  return this.connected.then(
    (db) =>
      new Promise((resolve, reject) => {
        db.collection("users")
          .findOne({ username: username })
          .then((user) => resolve(user))
          .catch((err) => reject(err));
      })
  );
};
Database.prototype.getRooms = function () {
  return this.connected.then(
    (db) =>
      new Promise((resolve, reject) => {
        db.collection("chatrooms")
          .find()
          .toArray()
          .then((rooms) => resolve(rooms))
          .catch((err) => reject(err));
      })
  );
};

Database.prototype.getRoom = function (room_id) {
  return this.connected.then(
    (db) =>
      new Promise((resolve, reject) => {
        var id = room_id;
        if (ObjectID.isValid(room_id)) {
          id = ObjectID(room_id);
        }
        db.collection("chatrooms")
          .findOne({ _id: id })
          .then((room) => {
            resolve(room);
          })
          .catch((err) => {
            reject(err);
          });
      })
  );
};

Database.prototype.addRoom = function (room) {
  return this.connected.then(
    (db) =>
      new Promise((resolve, reject) => {
        if (!room.name) {
          reject(new Error("No room name specified"));
        } else if (!room._id) {
          db.collection("chatrooms")
            .insertOne({
              name: room.name,
              image: room.image,
            })
            .then((res) => {
              var id = res.insertedId;
              db.collection("chatrooms")
                .findOne({ _id: id })
                .then((r) => {
                  resolve(r);
                })
                .catch((err) => reject(err));
            });
        } else {
          db.collection("chatrooms")
            .insertOne({
              _id: room._id,
              name: room.name,
              image: room.image,
            })
            .then((res) => {
              var id = res.insertedId;
              db.collection("chatrooms")
                .findOne({ _id: id })
                .then((r) => {
                  resolve(r);
                })
                .catch((err) => reject(err));
            });
        }
      })
  );
};

Database.prototype.getLastConversation = function (room_id, before) {
  return this.connected.then(
    (db) =>
      new Promise((resolve, reject) => {
        var beforeInt = Date.now();
        if (before) {
          beforeInt = parseInt(before);
        }
        db.collection("conversations")
          .find({
            room_id: room_id,
            timestamp: { $lt: beforeInt },
          })
          .toArray()
          .then((resp) => {
            if (resp.length) {
              resp.sort(function (a, b) {
                if (a.timestamp > b.timestamp) {
                  return -1;
                } else {
                  return 1;
                }
              });
              resolve(resp[0]);
            } else {
              resolve(null);
            }
          });
      })
  );
};

Database.prototype.addConversation = function (conversation) {
  return this.connected.then(
    (db) =>
      new Promise((resolve, reject) => {
        if (
          !conversation.room_id ||
          !conversation.timestamp ||
          !conversation.messages
        ) {
          reject(new Error("some fields are empty"));
        } else {
          db.collection("conversations")
            .insertOne(conversation)
            .then((res) => {
              var id = res.insertedId;
              db.collection("conversations")
                .findOne({ _id: id })
                .then((r) => {
                  resolve(r);
                })
                .catch((err) => reject(err));
            });
        }
      })
  );
};

module.exports = Database;
