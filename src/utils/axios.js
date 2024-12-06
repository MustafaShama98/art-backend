const axios = require('axios');

// Create a base instance
const axiosInstance = axios.create({
    timeout: 5000, // Request timeout in milliseconds
});

// Request interceptor
axiosInstance.interceptors.request.use(
    (config) => {
        // You can modify the request config here
        // For example, add an auth token
        // config.headers['Authorization'] = `Bearer ${getToken()}`;
        return config;
    },
    (error) => {
        // Handle request errors here
        return Promise.reject(error);
    }
);

// Response interceptor
axiosInstance.interceptors.response.use(
    (response) => {
        // You can modify the response data here
        return response;
    },
    (error) => {
        // Handle response errors here
        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            console.error('Data:', error.response.data);
            console.error('Status:', error.response.status);
            console.error('Headers:', error.response.headers);
        } else if (error.request) {
            // The request was made but no response was received
            console.error('Request:', error.request);
        } else {
            // Something happened in setting up the request that triggered an Error
            console.error('Error:', error.message);
        }
        return Promise.reject(error);
    }
);

// Export the instance
module.exports = axiosInstance;