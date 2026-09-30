const { HttpError } = require('../utils/httpError');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ statusCode: err.status, message: err.message });
  }
  if (err && err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ statusCode: 409, message: 'Duplicate entry' });
  }
  if (err && err.code === 'ER_ROW_IS_REFERENCED_2') {
    return res.status(409).json({ statusCode: 409, message: 'Cannot delete: still referenced by other records' });
  }
  console.error(err);
  res.status(500).json({ statusCode: 500, message: 'Internal server error' });
}

module.exports = errorHandler;
