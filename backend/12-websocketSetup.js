// =============================================
//  SETUP WEBSOCKET (SOCKET.IO)
// =============================================

const { getUserRoom } = require("./4-sessionUtils");

function setupWebSocket(io) {
  io.on("connection", (socket) => {
    console.log("Client connected for real-time updates");

    socket.on("registerUserSession", (payload) => {
      const userId = Number(payload?.userId);
      if (!Number.isNaN(userId) && userId > 0) {
        socket.join(getUserRoom(userId));
      }
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected");
    });
  });
}

module.exports = {
  setupWebSocket,
};
