
const IMQTTService = require("../interfaces/IMQTTService");


class MockMQTTService extends IMQTTService {
    constructor(mockResponses = {}) {
        super();
        this.mockResponses = {
            installation: {
                success: true,
                message: 'Mock installation successful',
                sys_id: Date.now().toString()
            },
            height: {
                success: true
            },
            delete:{
                success: true,
            },
            ...mockResponses
        };

        console.log('MOCK mqtt service connected.')
        // For testing purposes
        this.publishedMessages = [];
    }

    async publish_installation(installationData) {
        this.publishedMessages.push({
            type: 'installation',
            data: installationData
        });

        if (this.mockResponses.installation.error) {
            throw new Error(this.mockResponses.installation.error);
        }

        return this.mockResponses.installation;
    }

    async publish_height(sys_id) {
        this.publishedMessages.push({
            type: 'height',
            data: { sys_id }
        });

        if (this.mockResponses.height.error) {
            throw new Error(this.mockResponses.height.error);
        }

        return this.mockResponses.height;
    }

    async publish_deletion(sys_id){
        this.publishedMessages.push({
            type: 'deletion',
            data: sys_id
        });

        if (this.mockResponses.delete.error) {
            throw new Error(this.mockResponses.delete.error);
        }

        return this.mockResponses.delete;
    }

    // Helper methods for testing
    getPublishedMessages() {
        return this.publishedMessages;
    }

    clearPublishedMessages() {
        this.publishedMessages = [];
    }
}

module.exports = MockMQTTService;