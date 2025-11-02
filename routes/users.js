var User = require('../models/user');
var Task = require('../models/task');
var mongoose = require('mongoose');

// Helper function to validate ObjectId
function isValidObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

// Helper function to parse JSON query parameters
function parseQueryParam(param) {
    if (!param) return null;
    try {
        return JSON.parse(param);
    } catch (e) {
        throw new Error('Invalid JSON in query parameter');
    }
}

module.exports = function (router) {

    // GET /api/users - Get all users with query parameters
    router.route('/users').get(async function (req, res) {
        try {
            // Parse query parameters
            var where = parseQueryParam(req.query.where) || {};
            var sort = parseQueryParam(req.query.sort) || {};
            var select = parseQueryParam(req.query.select) || {};
            var skip = parseInt(req.query.skip) || 0;
            var limit = parseInt(req.query.limit) || 0; // 0 means no limit for users
            var count = req.query.count === 'true';

            // If count is requested, return count only
            if (count) {
                var userCount = await User.countDocuments(where);
                return res.json({ 
                    message: 'User count retrieved', 
                    data: userCount 
                });
            }

            // Build query
            var query = User.find(where).sort(sort).select(select).skip(skip);
            
            // Apply limit only if specified
            if (limit > 0) {
                query = query.limit(limit);
            }

            var users = await query.exec();
            res.json({ 
                message: 'Users retrieved successfully', 
                data: users 
            });
        } catch (err) {
            if (err.message === 'Invalid JSON in query parameter') {
                return res.status(400).json({ 
                    message: err.message, 
                    data: null 
                });
            }
            res.status(500).json({ 
                message: 'Server Error', 
                data: null 
            });
        }
    });

    // POST /api/users - Create a new user
    router.route('/users').post(async function (req, res) {
        try {
            var newUser = new User({
                name: req.body.name,
                email: req.body.email,
                pendingTasks: req.body.pendingTasks || []
            });

            var savedUser = await newUser.save();
            res.status(201).json({ 
                message: 'User created successfully', 
                data: savedUser 
            });
        } catch (err) {
            // Handle validation errors
            if (err.name === 'ValidationError') {
                return res.status(400).json({ 
                    message: 'Validation failed: ' + err.message, 
                    data: null 
                });
            }
            // Handle duplicate email error
            if (err.code === 11000) {
                return res.status(400).json({ 
                    message: 'Email already exists', 
                    data: null 
                });
            }
            res.status(500).json({ 
                message: 'Server Error', 
                data: null 
            });
        }
    });

    // GET /api/users/:id - Get a single user by ID
    router.route('/users/:id').get(async function (req, res) {
        try {
            // Validate ObjectId
            if (!isValidObjectId(req.params.id)) {
                return res.status(400).json({ 
                    message: 'Invalid user ID', 
                    data: null 
                });
            }

            // Parse select parameter
            var select = parseQueryParam(req.query.select) || {};

            var user = await User.findById(req.params.id).select(select);
            
            if (!user) {
                return res.status(404).json({ 
                    message: 'User not found', 
                    data: null 
                });
            }

            res.json({ 
                message: 'User retrieved successfully', 
                data: user 
            });
        } catch (err) {
            if (err.message === 'Invalid JSON in query parameter') {
                return res.status(400).json({ 
                    message: err.message, 
                    data: null 
                });
            }
            res.status(500).json({ 
                message: 'Server Error', 
                data: null 
            });
        }
    });

    // PUT /api/users/:id - Replace entire user (full replacement)
    router.route('/users/:id').put(async function (req, res) {
        try {
            // Validate ObjectId
            if (!isValidObjectId(req.params.id)) {
                return res.status(400).json({ 
                    message: 'Invalid user ID', 
                    data: null 
                });
            }

            var user = await User.findById(req.params.id);
            
            if (!user) {
                return res.status(404).json({ 
                    message: 'User not found', 
                    data: null 
                });
            }

            var oldPendingTasks = user.pendingTasks || [];
            var newPendingTasks = req.body.pendingTasks || [];

            // Validate that new name and email are provided (required fields)
            if (!req.body.name || !req.body.email) {
                return res.status(400).json({ 
                    message: 'Name and email are required', 
                    data: null 
                });
            }

            // Validate all tasks in newPendingTasks exist
            if (newPendingTasks.length > 0) {
                var tasks = await Task.find({ _id: { $in: newPendingTasks } });
                if (tasks.length !== newPendingTasks.length) {
                    return res.status(400).json({ 
                        message: 'One or more tasks in pendingTasks do not exist', 
                        data: null 
                    });
                }

                // Update all tasks in newPendingTasks to point to this user
                await Task.updateMany(
                    { _id: { $in: newPendingTasks } },
                    { 
                        assignedUser: req.params.id,
                        assignedUserName: req.body.name
                    }
                );
            }

            // Find tasks that were removed from pendingTasks
            var removedTasks = oldPendingTasks.filter(taskId => !newPendingTasks.includes(taskId));
            
            // Unassign removed tasks
            if (removedTasks.length > 0) {
                await Task.updateMany(
                    { 
                        _id: { $in: removedTasks },
                        assignedUser: req.params.id
                    },
                    { 
                        assignedUser: '',
                        assignedUserName: 'unassigned'
                    }
                );
            }

            // Replace user fields
            user.name = req.body.name;
            user.email = req.body.email;
            user.pendingTasks = newPendingTasks;
            // Note: dateCreated should not be updated

            var updatedUser = await user.save();
            res.json({ 
                message: 'User updated successfully', 
                data: updatedUser 
            });
        } catch (err) {
            // Handle validation errors
            if (err.name === 'ValidationError') {
                return res.status(400).json({ 
                    message: 'Validation failed: ' + err.message, 
                    data: null 
                });
            }
            // Handle duplicate email error
            if (err.code === 11000) {
                return res.status(400).json({ 
                    message: 'Email already exists', 
                    data: null 
                });
            }
            res.status(500).json({ 
                message: 'Server Error', 
                data: null 
            });
        }
    });

    // DELETE /api/users/:id - Delete a user
    router.route('/users/:id').delete(async function (req, res) {
        try {
            // Validate ObjectId
            if (!isValidObjectId(req.params.id)) {
                return res.status(400).json({ 
                    message: 'Invalid user ID', 
                    data: null 
                });
            }

            var user = await User.findById(req.params.id);
            
            if (!user) {
                return res.status(404).json({ 
                    message: 'User not found', 
                    data: null 
                });
            }

            // Unassign all incomplete tasks assigned to this user
            await Task.updateMany(
                { 
                    assignedUser: req.params.id,
                    completed: false
                },
                { 
                    assignedUser: '',
                    assignedUserName: 'unassigned'
                }
            );

            // Delete the user
            await User.findByIdAndDelete(req.params.id);

            res.json({ 
                message: 'User deleted successfully', 
                data: user 
            });
        } catch (err) {
            res.status(500).json({ 
                message: 'Server Error', 
                data: null 
            });
        }
    });

    return router;
};

