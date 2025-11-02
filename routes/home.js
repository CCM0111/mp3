module.exports = function (router) {

    var homeRoute = router.route('/');

    homeRoute.get(function (req, res) {
        res.json({ 
            message: 'Welcome to APIed Piper API', 
            data: null 
        });
    });

    return router;
}
