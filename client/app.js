var profile = {
  username: "Dwayne",
};

var Service = {
  origin: window.location.origin,
  getAllRooms: function () {
    return new Promise((resolve, reject) => {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", Service.origin + "/chat");
      xhr.onload = function () {
        if (xhr.status == 200) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(new Error(xhr.responseText));
        }
      };
      xhr.onerror = function (err) {
        reject(new Error(err));
      };
      xhr.send();
    });
  },
  addRoom: function (data) {
    return new Promise((resolve, reject) => {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", Service.origin + "/chat");
      xhr.setRequestHeader("Content-type", "application/json");
      xhr.onload = function () {
        if (xhr.status == 200) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(new Error(xhr.responseText));
        }
      };
      xhr.onerror = function (err) {
        reject(new Error(err));
      };
      xhr.send(JSON.stringify(data));
    });
  },
  getLastConversation: function (roomId, before) {
    return new Promise((resolve, reject) => {
      var xhr = new XMLHttpRequest();
      xhr.open(
        "GET",
        Service.origin + "/chat/" + roomId + "/messages?before=" + before
      );
      xhr.onload = function () {
        if (xhr.status == 200) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(new Error(xhr.responseText));
        }
      };
      xhr.onerror = function (err) {
        reject(new Error(err));
      };
      xhr.send();
    });
  },
  getProfile: function () {
    return new Promise((resolve, reject) => {
      let xhr = new XMLHttpRequest();
      xhr.open("GET", Service.origin + "/profile");
      xhr.onload = function () {
        if (xhr.status == 200) resolve(JSON.parse(xhr.responseText));
        else reject(new Error(xhr.responseText));
      };
      xhr.onerror = function () {
        reject(new Error());
      };
      xhr.send();
    });
  },
};

function* makeConversationLoader(room) {
  let before = room.creatStamp;
  while (room.canLoadConversation) {
    yield new Promise((resolve, reject) => {
      room.canLoadConversation = false;
      Service.getLastConversation(room.id, before)
        .then((resp) => {
          if (resp == null) {
            resolve(null);
          } else {
            room.canLoadConversation = true;
            before = resp.timestamp;
            room.addConversation(resp);
            resolve(resp);
          }
        })
        .catch((err) => reject(err));
    });
  }
}

var Room = function (
  id,
  name,
  image = "assets/everyone-icon.png",
  messages = []
) {
  this.id = id;
  this.name = name;
  this.image = image;
  this.messages = messages;
  this.canLoadConversation = true;
  this.creatStamp = Date.now();
  this.getLastConversation = makeConversationLoader(this);
};

Room.prototype.addConversation = function (conversation) {
  var newMessages = conversation.messages.concat(this.messages);
  this.messages = newMessages;
  this.onFetchConversation(conversation);
};

Room.prototype.addMessage = function (username, text) {
  if (text.trim() == "") {
    return;
  }
  var obj = {
    username: username,
    text: text,
  };
  this.messages.push(obj);
  if (this.onNewMessage) {
    this.onNewMessage(obj);
  }
};

var LobbyView = function (lobby) {
  this.elem = createDOM(`
<div class="content">
  <ul class="room-list">
  </ul>
  <div class="page-control">
    <input type="text" placeholder="Room title" />
    <button>Create Room</button>
  </div>
</div>
`);
  var that = this;
  this.listElem = this.elem.querySelector("ul.room-list");
  this.inputElem = this.elem.querySelector("input");
  this.buttonElem = this.elem.querySelector("button");
  this.lobby = lobby;
  this.lobby.onNewRoom = function (room) {
    let list_item = document.createElement("li");
    let a_elem = document.createElement("a");
    a_elem.href = "#/chat/" + room.id;
    let img_elem = document.createElement("img");
    img_elem.src = room.image;
    a_elem.appendChild(img_elem);
    var txt_node = document.createTextNode(room.name);
    a_elem.appendChild(txt_node);
    list_item.appendChild(a_elem);
    that.listElem.insertBefore(list_item, that.listElem.firstChild);
  };

  this.buttonElem.addEventListener("click", function () {
    var room_name = that.inputElem.value;
    var roomObj = {};
    roomObj["name"] = room_name;
    Service.addRoom(roomObj).then(
      (result) => {
        that.lobby.addRoom(
          result._id,
          room_name,
          result.image,
          result.messages
        );
        that.inputElem.value = "";
      },
      (err) => {
        console.log(err);
      }
    );
  });

  this.redrawList();
};

var Lobby = function () {
  this.rooms = {};
};

Lobby.prototype.getRoom = function (roomId) {
  for (var key in this.rooms) {
    if (roomId == key) {
      return this.rooms[key];
    }
  }
  return null;
};

Lobby.prototype.addRoom = function (id, name, image, messages) {
  var r = new Room(id, name, image, messages);
  this.rooms[id] = r;
  if (this.onNewRoom) {
    this.onNewRoom(r);
  }
};

LobbyView.prototype.redrawList = function () {
  emptyDOM(this.listElem);
  for (var key in this.lobby.rooms) {
    let list_item = document.createElement("li");
    let a_elem = document.createElement("a");
    a_elem.href = "#/chat/" + key;
    let img_elem = document.createElement("img");
    img_elem.src = this.lobby.rooms[key].image;
    a_elem.appendChild(img_elem);
    var txt_node = document.createTextNode(this.lobby.rooms[key].name);
    a_elem.appendChild(txt_node);
    list_item.appendChild(a_elem);
    this.listElem.insertBefore(list_item, this.listElem.firstChild);
  }
};

var ChatView = function (socket) {
  this.elem = createDOM(`
  <div class="content">
  <h4 class="room-name">room-name</h4>
  <div class="message-list">
  </div>
  <div class="page-control">
    <textarea></textarea>
    <button>Send</button>
  </div>
</div>
`);

  this.socket = socket;
  this.room = null;
  this.titleElem = this.elem.querySelector("h4");
  this.chatElem = this.elem.querySelector("div.message-list");
  this.inputElem = this.elem.querySelector("textarea");
  this.buttonElem = this.elem.querySelector("button");
  var that = this;

  this.buttonElem.addEventListener("click", () => {
    that.sendMessage();
  });

  this.chatElem.addEventListener("wheel", (e) => {
    if (
      this.room.canLoadConversation &&
      this.chatElem.scrollTop === 0 &&
      e.deltaY < 0
    ) {
      this.room.getLastConversation.next();
    }
  });
  this.inputElem.addEventListener("keyup", (e) => {
    let key = e.which || e.keyCode;
    if (key === 13 && !e.shiftKey) {
      that.sendMessage();
    }
  });
};

ChatView.prototype.sendMessage = function () {
  that.room.addMessage(profile.username, that.inputElem.value);
  var mObj = {};
  mObj["roomId"] = that.room.id;
  mObj["username"] = profile.username;
  mObj["text"] = that.inputElem.value;
  this.socket.send(JSON.stringify(mObj));
  that.inputElem.value = "";
};

ChatView.prototype.setRoom = function (room) {
  this.room = room;

  var self = this;
  this.room.onNewMessage = function (message) {
    let message_div = document.createElement("div");
    if (message.username == profile.username) {
      message_div.className = "message my-message";
    } else {
      message_div.className = "message";
    }
    let span_username = document.createElement("span");
    span_username.className = "message-user";
    let txt_username = document.createTextNode(message.username);
    span_username.appendChild(txt_username);
    message_div.appendChild(span_username);

    let span_text = document.createElement("span");
    span_text.className = "message-text";

    var messageArr = message.text.split("<");
    var mt = "";
    for (let e of messageArr) {
      mt += "?";
      mt += e;
      mt += "?";
    }
    let txt_text = document.createTextNode(mt);
    span_text.appendChild(txt_text);
    message_div.appendChild(span_text);

    self.chatElem.appendChild(message_div);
  };

  this.room.onFetchConversation = (conversation) => {
    let hb = this.chatElem.scrollHeight;
    let firstNode = self.chatElem.firstChild;
    conversation.messages.forEach((message) => {
      let message_div = document.createElement("div");
      if (message.username == profile.username) {
        message_div.className = "message my-message";
      } else {
        message_div.className = "message";
      }
      let span_username = document.createElement("span");
      span_username.className = "message-user";
      let txt_username = document.createTextNode(message.username);
      span_username.appendChild(txt_username);
      message_div.appendChild(span_username);

      let span_text = document.createElement("span");
      span_text.className = "message-text";
      let txt_text = document.createTextNode(message.text);
      span_text.appendChild(txt_text);
      message_div.appendChild(span_text);
      self.chatElem.insertBefore(message_div, firstNode);
    });
    let ha = this.chatElem.scrollHeight;
    this.chatElem.scrollTop = ha - hb;
  };

  emptyDOM(this.titleElem);
  var txt_node = document.createTextNode(room.name);
  this.titleElem.appendChild(txt_node);

  emptyDOM(this.chatElem);
  for (var m of this.room.messages) {
    let message_div = document.createElement("div");
    if (m.username == profile.username) {
      message_div.className = "message my-message";
    } else {
      message_div.className = "message";
    }
    let span_username = document.createElement("span");
    span_username.className = "message-user";
    let txt_username = document.createTextNode(m.username);
    span_username.appendChild(txt_username);
    message_div.appendChild(span_username);

    let span_text = document.createElement("span");
    span_text.className = "message-text";
    let txt_text = document.createTextNode(m.text);
    span_text.appendChild(txt_text);
    message_div.appendChild(span_text);
    this.chatElem.appendChild(message_div);
  }
};

var ProfileView = function () {
  this.elem = createDOM(`
  <div class="content">
    <div class="profile-form">
      <div class="form-field">
        <label>Username</label>
        <input type="text" />
      </div>

      <div class="form-field">
        <label>Password</label>
        <input type="password" />
      </div>

      <div class="form-field">
        <label>Avatar Image</label>
        <input type="file" />
      </div>
    </div>
    <div class="page-control">
      <button>Save</button>
    </div>
  </div>
  `);
};

function emptyDOM(elem) {
  while (elem.firstChild) elem.removeChild(elem.firstChild);
}

function createDOM(htmlString) {
  let template = document.createElement("template");
  template.innerHTML = htmlString.trim();
  return template.content.firstChild;
}

function main() {
  var lobby = new Lobby();
  var lobbyView = new LobbyView(lobby);
  var profileView = new ProfileView();

  profile["username"] = Service.getProfile();

  let socket = new WebSocket("ws://localhost:8000");

  function socketHandler() {
    var messageObj = JSON.parse(arguments[0].data);
    var roomObj = lobby.getRoom(messageObj.roomId);
    roomObj.addMessage(messageObj.username, messageObj.text);
  }

  socket.addEventListener("message", socketHandler);

  var chatView = new ChatView(socket);
  function renderRoute() {
    var page = window.location.hash.split("/")[1];
    var page_view = document.getElementById("page-view");
    if (page == "") {
      emptyDOM(page_view);
      page_view.appendChild(lobbyView.elem);
    } else if (page == "chat") {
      emptyDOM(page_view);
      page_view.appendChild(chatView.elem);
      let chatPageID = window.location.hash.split("/")[2];
      if (chatPageID) {
        var roomObj = lobby.getRoom(chatPageID);
        chatView.setRoom(roomObj);
      }
    } else if (page == "profile") {
      emptyDOM(page_view);
      page_view.appendChild(profileView.elem);
    }
  }
  window.addEventListener("popstate", renderRoute);

  renderRoute();
  function refreshLobby() {
    Service.getAllRooms().then((response) => {
      for (let i of response) {
        var r = lobby.rooms[i._id];
        if (r) {
          if (i.name) r.name = i.name;
          if (i.image) r.image = i.image;
          if (i.messages) r.messages = i.messages;
        } else {
          lobby.addRoom(i._id, i.name, i.image, i.messages);
        }
      }
    });
  }

  refreshLobby();

  setInterval(refreshLobby, 5100);
}

window.addEventListener("load", main);
