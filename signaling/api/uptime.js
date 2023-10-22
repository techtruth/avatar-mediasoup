/**
 * API Route - Allow external checks for uptime
 **/

const express = require("express");
const router = express.Router();

/**
 * @swagger
 * /uptime:
 *   get:
 *     tags:
 *       - Uptime
 *     summary: Check availability
 *     description: Sets http status 200 if possible
 *     responses:
 *       '200':
 *         description: Successfully connected
 */
router.get("/", (req, res) => {
  res.status(200).send();
});

module.exports = router;
