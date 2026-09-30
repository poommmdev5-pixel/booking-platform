// Wraps an async Express handler so a rejected promise reaches the error middleware
// instead of crashing the process (Express 4 does not await handlers itself).
module.exports = function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
