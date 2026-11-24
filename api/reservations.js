const { createReservationHandler } = require("../server");

module.exports = createReservationHandler();
module.exports.createHandler = createReservationHandler;
