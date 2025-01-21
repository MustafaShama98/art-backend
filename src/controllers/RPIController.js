

class RPIController {
    constructor(mqttService) {
        this.mqttService = mqttService; // DI
    }


    async start_program_painting(req, res) {
        try {    
            const { sys_id } = req.params;
    this.mqttService.publish_start_program(sys_id)
            res.json({
                success: true,
            
            });
        } catch (error) {
            console.error("Error shutdown:", error);
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }

    async stop_program_painting(req, res) {
        try {    
            const { sys_id } = req.params;
    this.mqttService.publish_stop_program(sys_id)
            res.json({
                success: true,
            
            });
        } catch (error) {
            console.error("Error shutdown:", error);
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }

    async shutdown_painting(req, res) {
        try {    
            const { sys_id } = req.params;
    this.mqttService.publish_shutdown(sys_id)
            res.json({
                success: true,
            
            });
        } catch (error) {
            console.error("Error shutdown:", error);
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }

    async restart_painting(req, res) {
        try {    
            const { sys_id } = req.params;

    this.mqttService.publish_restart(sys_id)
            res.json({
                success: true,
            
            });
        } catch (error) {
            console.error("Error restart:", error);
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }

}

module.exports = RPIController;