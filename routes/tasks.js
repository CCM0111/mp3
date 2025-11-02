var Task = require('../models/task');
var User = require('../models/user');
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

    // GET /api/tasks - Get all tasks with query parameters
    router.route('/tasks').get(async function (req, res) {
        try {
            // Parse query parameters
            var where = parseQueryParam(req.query.where) || {};
            var sort = parseQueryParam(req.query.sort) || {};
            var select = parseQueryParam(req.query.select) || {};
            var skip = parseInt(req.query.skip) || 0;
            var limit = parseInt(req.query.limit) || 100; // Default limit for tasks is 100
            var count = req.query.count === 'true';

            // If count is requested, return count only
            if (count) {
                var taskCount = await Task.countDocuments(where);
                return res.json({ 
                    message: 'Task count retrieved', 
                    data: taskCount 
                });
            }

            // Build query
            var query = Task.find(where).sort(sort).select(select).skip(skip).limit(limit);

            var tasks = await query.exec();
            res.json({ 
                message: 'Tasks retrieved successfully', 
                data: tasks 
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

    // POST /api/tasks - Create a new task
    router.route('/tasks').post(async function (req, res) {
        try {
            // Validate required fields
            if (!req.body.name || !req.body.deadline) {
                return res.status(400).json({ 
                    message: 'Name and deadline are required', 
                    data: null 
                });
            }

            // If assignedUser is provided, validate it exists
            if (req.body.assignedUser && req.body.assignedUser !== '') {
                var user = await User.findById(req.body.assignedUser);
                if (!user) {
                    return res.status(400).json({ 
                        message: 'Assigned user does not exist', 
                        data: null 
                    });
                }
            }

            var newTask = new Task({
                name: req.body.name,
                description: req.body.description || '',
                deadline: req.body.deadline,
                completed: req.body.completed || false,
                assignedUser: req.body.assignedUser || '',
                assignedUserName: req.body.assignedUserName || 'unassigned'
            });

            var savedTask = await newTask.save();

            // If task is assigned to a user, add it to user's pendingTasks
            if (savedTask.assignedUser && savedTask.assignedUser !== '') {
                await User.findByIdAndUpdate(
                    savedTask.assignedUser,
                    { $addToSet: { pendingTasks: savedTask._id.toString() } }
                );
            }

            res.status(201).json({ 
                message: 'Task created successfully', 
                data: savedTask 
            });
        } catch (err) {
            // Handle validation errors
            if (err.name === 'ValidationError') {
                return res.status(400).json({ 
                    message: 'Validation failed: ' + err.message, 
                    data: null 
                });
            }
            res.status(500).json({ 
                message: 'Server Error', 
                data: null 
            });
        }
    });

    // GET /api/tasks/:id - Get a single task by ID
    router.route('/tasks/:id').get(async function (req, res) {
        try {
            // Validate ObjectId
            if (!isValidObjectId(req.params.id)) {
                return res.status(400).json({ 
                    message: 'Invalid task ID', 
                    data: null 
                });
            }

            // Parse select parameter
            var select = parseQueryParam(req.query.select) || {};

            var task = await Task.findById(req.params.id).select(select);
            
            if (!task) {
                return res.status(404).json({ 
                    message: 'Task not found', 
                    data: null 
                });
            }

            res.json({ 
                message: 'Task retrieved successfully', 
                data: task 
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

    // PUT /api/tasks/:id - Replace entire task (full replacement)
    router.route('/tasks/:id').put(async function (req, res) {
        try {
            // Validate ObjectId
            if (!isValidObjectId(req.params.id)) {
                return res.status(400).json({ 
                    message: 'Invalid task ID', 
                    data: null 
                });
            }

            var task = await Task.findById(req.params.id);
            
            if (!task) {
                return res.status(404).json({ 
                    message: 'Task not found', 
                    data: null 
                });
            }

            // Validate required fields
            if (!req.body.name || !req.body.deadline) {
                return res.status(400).json({ 
                    message: 'Name and deadline are required', 
                    data: null 
                });
            }

            var oldAssignedUser = task.assignedUser;
            var newAssignedUser = req.body.assignedUser || '';

            // If new assigned user is provided and not empty, validate it exists
            if (newAssignedUser && newAssignedUser !== '') {
                var user = await User.findById(newAssignedUser);
                if (!user) {
                    return res.status(400).json({ 
                        message: 'Assigned user does not exist', 
                        data: null 
                    });
                }
            }

            // Handle bidirectional reference updates
            if (oldAssignedUser !== newAssignedUser) {
                // Remove task from old user's pendingTasks
                if (oldAssignedUser && oldAssignedUser !== '') {
                    await User.findByIdAndUpdate(
                        oldAssignedUser,
                        { $pull: { pendingTasks: req.params.id } }
                    );
                }

                // Add task to new user's pendingTasks
                if (newAssignedUser && newAssignedUser !== '') {
                    await User.findByIdAndUpdate(
                        newAssignedUser,
                        { $addToSet: { pendingTasks: req.params.id } }
                    );
                }
            }

            // Replace task fields
            task.name = req.body.name;
            task.description = req.body.description || '';
            task.deadline = req.body.deadline;
            task.completed = req.body.completed !== undefined ? req.body.completed : false;
            task.assignedUser = newAssignedUser;
            task.assignedUserName = req.body.assignedUserName || (newAssignedUser ? req.body.assignedUserName : 'unassigned');
            // Note: dateCreated should not be updated

            var updatedTask = await task.save();
            res.json({ 
                message: 'Task updated successfully', 
                data: updatedTask 
            });
        } catch (err) {
            // Handle validation errors
            if (err.name === 'ValidationError') {
                return res.status(400).json({ 
                    message: 'Validation failed: ' + err.message, 
                    data: null 
                });
            }
            res.status(500).json({ 
                message: 'Server Error', 
                data: null 
            });
        }
    });

    // DELETE /api/tasks/:id - Delete a task
    router.route('/tasks/:id').delete(async function (req, res) {
        try {
            // Validate ObjectId
            if (!isValidObjectId(req.params.id)) {
                return res.status(400).json({ 
                    message: 'Invalid task ID', 
                    data: null 
                });
            }

            var task = await Task.findById(req.params.id);
            
            if (!task) {
                return res.status(404).json({ 
                    message: 'Task not found', 
                    data: null 
                });
            }

            // Remove task from assigned user's pendingTasks
            if (task.assignedUser && task.assignedUser !== '') {
                await User.findByIdAndUpdate(
                    task.assignedUser,
                    { $pull: { pendingTasks: req.params.id } }
                );
            }

            // Delete the task
            await Task.findByIdAndDelete(req.params.id);

            res.json({ 
                message: 'Task deleted successfully', 
                data: task 
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

