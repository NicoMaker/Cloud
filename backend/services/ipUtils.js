// =============================================
//  UTILITÀ IP
// =============================================

const os = require("os");
const https = require("https");

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses || []) {
      if (address.family === "IPv4" && !address.internal) {
        return address.address;
      }
    }
  }
  return "127.0.0.1";
}

async function getPublicIP() {
  try {
    return await new Promise((resolve, reject) => {
      https
        .get("https://api.ipify.org?format=json", (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              const ip = JSON.parse(data).ip;
              resolve(ip || null);
            } catch (error) {
              reject(error);
            }
          });
        })
        .on("error", reject);
    });
  } catch (error) {
    console.error("⚠️ Impossibile recuperare IP pubblico:", error.message);
    return null;
  }
}

module.exports = {
  getLocalIP,
  getPublicIP,
};
