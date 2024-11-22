
describe('PaintingController', () => {
    let controller;
    let mockMqttService;

    beforeEach(() => {
        // Setup mock with custom responses if needed
        mockMqttService = new MockMQTTService({
            installation: {
                success: true,
                message: 'Test installation successful',
                sys_id: '123',
                device: 'm5stack'
            }
        });
        controller = new PaintingController(mockMqttService);
    });

    test('createPainting should handle successful installation', async () => {
        const req = {
            body: {
                name: 'Test Painting',
                height: 100,
                width: 50
            }
        };

        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };

        await controller.createPainting(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: true,
                data: expect.any(Object)
            })
        );
    });

    test('createPainting should handle failed installation', async () => {
        // Override mock response for this test
        mockMqttService.mockResponses.installation = {
            success: false,
            error: 'Mock installation failed'
        };

        const req = {
            body: {
                name: 'Test Painting',
                height: 100,
                width: 50
            }
        };

        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };

        await controller.createPainting(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                error: expect.any(String)
            })
        );
    });
});