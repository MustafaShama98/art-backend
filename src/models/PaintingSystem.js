const mongoose = require('mongoose');

const paintingSchema = new mongoose.Schema({
    sys_id: {
        type: Number,
        required: true,
        unique: true,
        trim: true
    },
    
    name: {
        type: String,
        required: [true, 'Painting name is required'],
        trim: true
    },
    painter_name: {
        type: String,
        required: [true, ' Painter name is required'],
        trim: true
    },
    base_height: {
        type: Number,
        required: [true, 'Base height is required'],
        min: [0, 'Base height cannot be negative']
    },
    height: {
        type: Number,
        required: [true, 'Height is required'],
        min: [0, 'Height cannot be negative']
    },
    width: {
        type: Number,
        required: [true, 'Width is required'],
        min: [0, 'Width cannot be negative']
    },
    weight: {
        type: Number,
        required: true,
    },
    status: {
        type: String,
        enum: ['Active', 'Inactive'],
        default: 'Inactive'
    },
    photo: {
        type: Buffer, // Storing photo as binary data
        required: false,
    },
    
    lastUpdated: {
        type: Date,
        default: Date.now
    },
    created: {
        type: Date,
        default: Date.now,
        immutable: true
    }
}, {
    timestamps: true, // Adds createdAt and updatedAt automatically
    toJSON: {
        virtuals: true,
        transform: function(doc, ret) {
            ret.id = ret._id;
            delete ret._id;
            delete ret.__v;
            return ret;
        }
    }
});

// Add index for faster queries
paintingSchema.index({ sys_id: 1 }, { unique: true });
paintingSchema.index({ status: 1 });

// Add a virtual field for total height
paintingSchema.virtual('totalHeight').get(function() {
    return this.base_height + this.height;
});

// Add instance methods
paintingSchema.methods.updateHeight = function(newHeight) {
    this.height = newHeight;
    this.lastUpdated = Date.now();
    return this.save();
};

// Add static methods
paintingSchema.statics.findBySysId = function(sys_id) {
    return this.findOne({ sys_id });
};

const Painting = mongoose.model('Painting', paintingSchema);

module.exports = Painting;

// Example usage:
/*
// Create new painting
const newPainting = new Painting({
    sys_id: "PAINT_001",
    name: "Mona Lisa",
    base_height: 100,
    height: 50,
    width: 80
});

// Save painting
await newPainting.save();

// Find painting
const painting = await Painting.findBySysId("PAINT_001");

// Update height
await painting.updateHeight(60);

// Query paintings
const activePaintings = await Painting.find({ status: 'active' });
*/