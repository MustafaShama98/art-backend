// models/PaintingStats.js
const mongoose = require('mongoose');
const Painting = require('./PaintingSystem');

const viewingSessionSchema = new mongoose.Schema({
    startTime: {
        type: Date,
        required: true,
    },
    endTime: {
        type: Date,
        required: false,  // Allow null for ongoing sessions
    },
    duration: {
        type: Number,
        required: false,  // Will be calculated when session ends
    }
});


const paintingStatsSchema = new mongoose.Schema({
    painting_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Painting',
        required: true
    },
    
    sys_id: {
        type: Number,
        required: true,
    },
    totalViews: {
        type: Number,
        default: 0
    },
    totalViewDuration: {
        type: Number, // Total duration in seconds
        default: 0
    },
    averageViewDuration: {
        type: Number,
        default: 0
    },
    lastViewed: {
        type: Date,
        default: null
    },
    isStill: { // Indicates whether the painting is still in the system or deleted
        type: Boolean,
        default: true, // Default to true (still in the system)
    },
    name: { 
        type: String,
        required: false
        
    },
    viewingSessions: [viewingSessionSchema],
    dailyStats: [{
        date: {
            type: Date,
            required: true
        },
        views: {
            type: Number,
            default: 0
        },
        totalDuration: {
            type: Number,
            default: 0
        }
    }]
}, {
    timestamps: true
});

paintingStatsSchema.methods.addViewingSession = async function (startTime, endTime) {
    if (!endTime) {
        // Handle a new ongoing session
        this.viewingSessions.push({
            startTime,
            endTime: null,
            duration: null,
        });
        this.lastViewed = startTime;
        return await this.save();
    }

    const duration = Math.floor((endTime - startTime) / 1000);

    // Find the session by matching the startTime
    const sessionIndex = this.viewingSessions.findIndex(
        (session) => session.startTime?.getTime() === startTime?.getTime()
    );

    if (sessionIndex !== -1) {
        // Update the existing session
        this.viewingSessions[sessionIndex] = {
            startTime : this.viewingSessions[sessionIndex].startTime, // Retain existing fields
            endTime,
            duration,
        };

    }
    // Update total stats
    this.totalViews = (this.totalViews || 0) + 1;
    this.totalViewDuration = (this.totalViewDuration || 0) + duration;
    this.averageViewDuration =
        this.totalViews > 0
            ? this.totalViewDuration / this.totalViews
            : 0;
    this.lastViewed = endTime;

    // Update daily stats
    const dateKey = new Date(startTime.toISOString().split("T")[0]);
    const dailyStatIndex = this.dailyStats.findIndex(
        (stat) =>
            stat.date.toISOString().split("T")[0] ===
            dateKey.toISOString().split("T")[0]
    );

    if (dailyStatIndex >= 0) {
        // Update existing daily stats
        this.dailyStats[dailyStatIndex].views += 1;
        this.dailyStats[dailyStatIndex].totalDuration += duration;
    } else {
        // Add new daily stats
        this.dailyStats.push({
            date: dateKey,
            views: 1,
            totalDuration: duration,
        });
    }

    // Save the updated document
    return await this.save();
};

// Static method to get statistics for a date range
paintingStatsSchema.statics.getStatsByDateRange = async function(startDate, endDate) {
    return this.aggregate([
        {
            $unwind: "$dailyStats"
        },
        {
            $match: {
                "dailyStats.date": {
                    $gte: startDate,
                    $lte: endDate
                }
            }
        },
        {
            $group: {
                _id: "$painting_id",
                totalViews: { $sum: "$dailyStats.views" },
                totalDuration: { $sum: "$dailyStats.totalDuration" },
                dailyBreakdown: {
                    $push: {
                        date: "$dailyStats.date",
                        views: "$dailyStats.views",
                        duration: "$dailyStats.totalDuration"
                    }
                }
            }
        },
        {
            $lookup: {
                from: "paintings",
                localField: "_id",
                foreignField: "_id",
                as: "paintingDetails"
            }
        }
    ]);
};

const PaintingStats = mongoose.model('Painting_Stats', paintingStatsSchema);
module.exports = {PaintingStats,initializePaintingStats};
 
async function initializePaintingStats() {
    // Get all paintings that don't have stats yet
    const paintings = await Painting.find();
    const {sys_id, _id  } = paintings[0];
        const existingStats =
            await PaintingStats.findOne({ sys_id: sys_id});

        if (!existingStats) {
            const newStats = new PaintingStats({
                painting_id: _id,
                sys_id: sys_id,
                isStill: true, // Default to true
            });
            await newStats.save();
        }

     const stats = await PaintingStats.findOne({ sys_id: sys_id });
     await stats.addViewingSession(new Date('2024-03-01T10:00:00'), new Date('2024-03-01T10:05:00'));

// Get stats for a date range
     const weeklyStats = await PaintingStats.getStatsByDateRange(
         new Date('2024-03-01'),
         new Date('2024-03-07')
     );
console.log(weeklyStats)
}


