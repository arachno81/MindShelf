import axios from 'axios';

export const initializeCsrf = async () => {
    await axios.get('/sanctum/csrf-cookie');
};
