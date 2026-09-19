const validate = (schema) => {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.body);
      req.validated = validated;
      next();
    } catch (err) {
      if (err.errors) {
        return res.status(400).json({
          success: false,
          error: err.errors[0].message
        });
      }
      return res.status(400).json({
        success: false,
        error: 'Validation failed'
      });
    }
  };
};

module.exports = { validate };
