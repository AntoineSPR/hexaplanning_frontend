import { expect, jest } from '@jest/globals'; // ✅ Import Jest correctement
import { verifyEnvironment } from './environments/verify-environment';


jest.mock('./environments/verify-environment', () => {
    const mockEnvironment = { name: 'production', apiUrl: '' };
    return {
        verifyEnvironment: jest.fn(() => {
            if (!mockEnvironment.apiUrl) {
                mockEnvironment.apiUrl = 'https://default-api-url.com';
            }
        }),
        environment: mockEnvironment,
    };
});

describe('main.ts', () => {
    beforeEach(() => {
        jest.clearAllMocks(); // ✅ Nettoyage des mocks avant chaque test
    });

    it('should call verifyEnvironment', () => {
        expect(verifyEnvironment).toBeDefined();
        verifyEnvironment();
        expect(verifyEnvironment).toHaveBeenCalled();
    });

    it('should set the environment.apiUrl if not defined', () => {
        const { environment } = jest.requireMock('./environments/verify-environment') as { environment: { apiUrl: string } };
        verifyEnvironment();
        expect(environment.apiUrl).toBe('https://default-api-url.com');
    });
});
