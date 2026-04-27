const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Bot is online!');
});

function keepAlive() {
  app.listen(3000, () => {
    console.log("Keep Alive Server is ready!");
  });
}

module.exports = keepAlive;