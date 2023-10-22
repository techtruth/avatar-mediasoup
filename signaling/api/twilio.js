/**
 * API Route - STUN/TURN tokens from twilio
 **/

const express = require("express");
const router = express.Router();
const client = require("twilio")(
  process.env.TWILIO_ACCOUNTSID,
  process.env.TWILIO_AUTHTOKEN
);
let iceServers = {};

//stun turn stuff
function updateTwilioTokens() {
  console.log("Retrieving new tokens from Twilio.");
  client.tokens
    .create({ ttl: process.env.TWILIO_TIMETOLIVEINSECONDS })
    .then((token) => {
      //Remove TCP from ice stack
      iceServers = token.iceServers;
    });
  console.log("Refreshing in", process.env.TWILIO_REFRESHINSECONDS, "seconds");
  setTimeout(updateTwilioTokens, process.env.TWILIO_REFRESHINSECONDS * 1000);
}
updateTwilioTokens();

/**
 * @swagger
 * /extcom/stunturn:
 *   get:
 *     tags:
 *       - Twilio
 *     summary: Retrieve a list of ice servers.
 *     description: Retrieve a list of ice servers for the client to use as a fallback to find the most reliable connection
 *     responses:
 *       '200':
 *         description: Successfully connected
 */
router.get("/stunturn", (_req, res) => {
  res.send(iceServers);
});

module.exports = router;
