function ensureAuthenticated(req, res, next) {
    if (req.session.user) {
        return next();
    }
    res.redirect('/');
}

function ensureAdmin(req, res, next) {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    res.send("Access denied. Admins only.");
}

module.exports = {
    ensureAuthenticated,
    ensureAdmin
};