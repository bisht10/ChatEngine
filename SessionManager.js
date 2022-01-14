const crypto = require("crypto");

class SessionError extends Error {}

function SessionManager() {
  // default session length
  const CookieMaxAgeMs = 600000;

  // keeping the session data inside a closure to keep them protected
  const sessions = {};

  this.createSession = (response, username, maxAge = CookieMaxAgeMs) => {
    const tk = crypto.randomBytes(20).toString("hex");
    var obj = {};
    obj["username"] = username;
    obj["expire"] = maxAge;
    obj["timestamp"] = Date.now();
    sessions[tk] = obj;

    response.cookie("session", tk, { maxAge: maxAge });

    setTimeout(function () {
      delete sessions[tk];
    }, maxAge);
  };

  this.deleteSession = (request) => {
    delete sessions[request.session];
    delete request.username;
    delete request.session;
  };

  this.middleware = (request, response, next) => {
    if (request.headers.cookie) {
      var tokList = request.headers.cookie.split(";");
      for (let elem of tokList) {
        var tok = elem.split("=")[1];
        var sesh = elem.split("=")[0];
        if (sessions[tok] && sesh == "session") {
          request.username = sessions[tok].username;
          request.session = tok;
          next();
          return;
        } else {
          next(new SessionError());
          return;
        }
      }
    } else {
      next(new SessionError());
      return;
    }
  };

  this.getUsername = (token) =>
    token in sessions ? sessions[token].username : null;
}

// "SessionManager.Error" available to other modules
SessionManager.Error = SessionError;

module.exports = SessionManager;
