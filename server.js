const path = require("path");
const fs = require("fs");
const ws = require("ws");
const express = require("express");
const database = require("./Database.js");
const SessionManager = require("./SessionManager.js");
const crypto = require("crypto");
const { request } = require("http");

const db = database("mongodb://localhost:27017", "messenger");
const sessionManager = new SessionManager();
const messageBlockSize = 10;
function logRequest(req, res, next) {
  console.log(`${new Date()}  ${req.ip} : ${req.method} ${req.path}`);
  next();
}

var chatrooms = [];
let messages = {};

function isCorrectPassword(password, saltedHash) {
  var salt = saltedHash.substring(0, 20);
  var hash = crypto
    .createHash("sha256")
    .update(password + salt)
    .digest("base64");

  return salt + hash == saltedHash;
}

db.getRooms().then((arr) => {
  arr.forEach((element) => {
    messages[element._id] = [];
  });
});

let broker = new ws.Server({ port: 8000 });

broker.on("connection", (cs, req) => {
  if (req.headers.cookie) {
    // for some reason string.split or req.header.cookie["session"] doesnt work
    let username = sessionManager.getUsername(req.headers.cookie.substring(16));
    if (username === null) {
      cs.close();
    } else {
      cs.on("message", function message(m) {
        var data = JSON.parse(m);
        var mObj = {};
        mObj["username"] = username;
        mObj["text"] = data.text;
        if (!messages[data.roomId]) {
          messages[data.roomId] = [];
        }
        messages[data.roomId].push(mObj);

        if (messages[data.roomId].length == messageBlockSize) {
          var convoObj = {
            room_id: data.roomId,
            timestamp: Date.now(),
            messages: messages[data.roomId],
          };
          db.addConversation(convoObj).then(() => {
            messages[data.roomId] = [];
          });
        }

        for (let c of broker.clients) {
          if (c !== cs) {
            c.send(JSON.stringify(data));
          }
        }
      });
    }
  } else {
    cs.close();
  }
});

const host = "localhost";
const port = 3000;
const clientApp = path.join(__dirname, "client");

// express app
let app = express();

app.use(express.json()); // to parse application/json
app.use(express.urlencoded({ extended: true })); // to parse application/x-www-form-urlencoded
app.use(logRequest); // logging for debug

app.listen(port, () => {
  console.log(
    `${new Date()}  App Started. Listening on ${host}:${port}, serving ${clientApp}`
  );
});

app.use((req, res, next) => {
  const paths = ["/style.css", "/style", "/login", "/login.html"];
  if (!paths.includes(req.path)) {
    return sessionManager.middleware(req, res, next);
  }
  return next();
});

// serve static files (client-side)
app.use("/index.html", express.static(clientApp));
app.use("/index", express.static(clientApp));
app.use("/app.js", express.static(clientApp));
app.use("/", express.static(clientApp, { extensions: ["html"] }));

app.use(function (err, req, res, next) {
  if (err instanceof SessionManager.Error) {
    if (req.headers.accept == "application/json") {
      res.status(401).send(err);
    } else {
      res.redirect("/login");
    }
  } else {
    res.status(500).send();
  }
});

app.post("/login", (req, res) => {
  db.getUser(req.body.username)
    .then((user) => {
      if (isCorrectPassword(req.body.password, user.password)) {
        sessionManager.createSession(res, req.body.username);
        res.redirect("/");
      } else {
        res.redirect("/login");
      }
    })
    .catch((err) => {
      res.redirect("/login");
    });
});

app.get("/logout", function (req, res) {
  sessionManager.deleteSession(req);
  res.redirect("/login");
});

app.get("/profile", (req, res) => {
  res.json({ username: req.username });
});

app.get("/chat", (req, res) => {
  db.getRooms().then((arr) => {
    var responseArray = [];
    arr.forEach((element) => {
      var obj = JSON.parse(JSON.stringify(element));
      obj.messages = messages[element._id];
      responseArray.push(obj);
    });
    res.json(responseArray);
  });
});

app.get("/chat/:room_id", sessionManager.middleware, (req, res) => {
  db.getRoom(req.params.room_id).then((doc) => {
    if (doc == null) {
      res.status(404).send("Room was not found");
    } else {
      res.json(doc);
    }
  });
});

app.get("/chat/:room_id/messages", (req, res) => {
  db.getLastConversation(req.params.room_id, req.query.before).then((doc) => {
    if (doc == null) {
      res.send();
    } else {
      res.json(doc);
    }
  });
});

app.post("/chat", (req, res) => {
  if (req.body.name) {
    var roomObj = {};
    roomObj["name"] = req.body.name;
    var img = "";
    if (req.body.image) {
      img = req.body.image;
    }
    roomObj["image"] = img;
    db.addRoom(roomObj).then((resp) => {
      messages[resp._id] = [];
      res.json(resp);
    });
  } else {
    res.status(400).send("Room has no name");
  }
});
