// =============================================
//  UTILITÀ GESTIONE SESSIONI
// =============================================

const USER_ROOM_PREFIX = "user:";

function getUserRoom(userId) {
  return `${USER_ROOM_PREFIX}${userId}`;
}

function destroyUserSessionsByUserId(app, userId, callback) {
  if (!app.sessionStore || typeof app.sessionStore.all !== "function") {
    return callback();
  }

  app.sessionStore.all((allErr, sessions) => {
    if (allErr || !sessions) {
      console.error("Errore lettura sessioni:", allErr);
      return callback();
    }

    const matchingSessionIds = Object.entries(sessions)
      .filter(([, sess]) => Number(sess?.user?.id) === Number(userId))
      .map(([sid]) => sid);

    if (matchingSessionIds.length === 0) {
      return callback();
    }

    let pending = matchingSessionIds.length;
    matchingSessionIds.forEach((sid) => {
      app.sessionStore.destroy(sid, (destroyErr) => {
        if (destroyErr) {
          console.error("Errore destroy session:", destroyErr);
        }
        pending -= 1;
        if (pending === 0) callback();
      });
    });
  });
}

function forceLogoutUserEverywhere(
  io,
  app,
  userId,
  reason = "account_changed",
  callback,
) {
  // 1. Prima distruggi le sessioni sul server
  destroyUserSessionsByUserId(app, userId, () => {
    // 2. Poi emetti forceLogout — il browser riceve l'evento e fa il redirect al login
    io.to(getUserRoom(userId)).emit("forceLogout", { reason });

    // 3. Dopo 2 secondi disconnetti i socket (il browser ha già fatto il redirect)
    setTimeout(() => {
      io.in(getUserRoom(userId)).disconnectSockets(true);
    }, 2000);

    if (callback) callback();
  });
}

module.exports = {
  USER_ROOM_PREFIX,
  getUserRoom,
  destroyUserSessionsByUserId,
  forceLogoutUserEverywhere,
};
