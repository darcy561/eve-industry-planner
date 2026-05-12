import { describe, it, expect, beforeEach } from 'vitest';
import { createTestStore, createMockStore, createTestData, waitForStoreCondition } from './utils.js';
import store from '../src/Zustand/usersStore';

// Example test for Zustand store actions
describe('Zustand Store Testing Examples', () => {
  describe('Store Actions', () => {
    it('should test store actions directly', () => {
      // Create a fresh store instance for testing
      const testStore = createTestStore(() => store);
      
      // Test initial state
      const initialState = testStore.getState();
      expect(initialState).toBeDefined();
      
      // Test that actions exist
      expect(initialState.account?.actions).toBeDefined();
      expect(initialState.applicationSettings?.actions).toBeDefined();
      expect(initialState.jobData?.actions).toBeDefined();
    });

    it('should test state updates', () => {
      const testStore = createTestStore(() => store);
      
      // Get initial state
      const initialState = testStore.getState();
      
      // Test updating state directly
      testStore.setState({
        account: {
          ...initialState.account,
          isLoggedIn: true,
          mainCharacterHash: 'abc123',
        },
      });
      
      // Verify state was updated
      const updatedState = testStore.getState();
      expect(updatedState.account.isLoggedIn).toBe(true);
      expect(updatedState.account.mainCharacterHash).toBe('abc123');
    });
  });

  describe('Mock Store Testing', () => {
    it('should test components with mock store', () => {
      // Create mock store with specific state
      const mockStore = createMockStore({
        account: {
          isLoggedIn: true,
          mainCharacterHash: 'main-hash',
        },
        applicationSettings: {
          theme: 'dark',
          language: 'en'
        }
      });

      // Test that mock store works
      const state = mockStore.getState();
      expect(state.account.isLoggedIn).toBe(true);
      expect(state.account.mainCharacterHash).toBe('main-hash');
      expect(state.applicationSettings.theme).toBe('dark');
    });
  });

  describe('Async Operations', () => {
    it('should test async store operations', async () => {
      const testStore = createTestStore(() => store);
      
      // Simulate async operation
      const asyncOperation = async () => {
        testStore.setState({
          account: {
            ...testStore.getState().account,
            isLoggedIn: false,
          },
        });
        
        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 100));
        
        testStore.setState({
          account: {
            ...testStore.getState().account,
            isLoggedIn: true,
          },
        });
      };

      // Start async operation
      const operationPromise = asyncOperation();
      
      // Wait for login flag after simulated API
      await waitForStoreCondition(
        testStore, 
        (state) => state.account.isLoggedIn === true,
        1000
      );
      
      // Verify final state
      const finalState = testStore.getState();
      expect(finalState.account.isLoggedIn).toBe(true);
      
      // Wait for operation to complete
      await operationPromise;
    });
  });
});

// Example test for account slice
describe('Account store slice', () => {
  let testStore;

  beforeEach(() => {
    testStore = createTestStore(() => store);
  });

  it('should have correct initial state structure', () => {
    const state = testStore.getState();
    
    expect(state.account).toBeDefined();
    expect(state.account.actions).toBeDefined();
    expect(typeof state.account.actions.setLoggedIn).toBe('function');
    expect(typeof state.account.actions.addCharacter).toBe('function');
  });

  it('should handle login-related account fields', () => {
    const state = testStore.getState();
    const testUser = createTestData().user();
    
    testStore.setState({
      account: {
        ...state.account,
        isLoggedIn: true,
        mainCharacterHash: testUser.uid,
      },
    });

    const updatedState = testStore.getState();
    expect(updatedState.account.isLoggedIn).toBe(true);
    expect(updatedState.account.mainCharacterHash).toBe(testUser.uid);
  });
});

// Example test for application settings
describe('Application Settings Store', () => {
  let testStore;

  beforeEach(() => {
    testStore = createTestStore(() => store);
  });

  it('should update theme setting', () => {
    const state = testStore.getState();
    
    // Update theme
    testStore.setState({
      applicationSettings: {
        ...state.applicationSettings,
        theme: 'dark'
      }
    });

    const updatedState = testStore.getState();
    expect(updatedState.applicationSettings.theme).toBe('dark');
  });

  it('should handle multiple setting updates', () => {
    const state = testStore.getState();
    
    // Update multiple settings at once
    testStore.setState({
      applicationSettings: {
        ...state.applicationSettings,
        theme: 'light',
        language: 'es',
        notifications: true
      }
    });

    const updatedState = testStore.getState();
    expect(updatedState.applicationSettings.theme).toBe('light');
    expect(updatedState.applicationSettings.language).toBe('es');
    expect(updatedState.applicationSettings.notifications).toBe(true);
  });
});

// Example test for job data store
describe('Job Data Store', () => {
  let testStore;

  beforeEach(() => {
    testStore = createTestStore(() => store);
  });

  it('should manage job arrays', () => {
    const state = testStore.getState();
    const testJob = createTestData().job();
    
    // Add a job
    testStore.setState({
      jobData: {
        ...state.jobData,
        jobs: [...(state.jobData.jobs || []), testJob]
      }
    });

    const updatedState = testStore.getState();
    expect(updatedState.jobData.jobs).toContain(testJob);
    expect(updatedState.jobData.jobs).toHaveLength(1);
  });

  it('should handle job status updates', () => {
    const state = testStore.getState();
    const testJob = createTestData().job({ status: 'active' });
    
    // Set initial job
    testStore.setState({
      jobData: {
        ...state.jobData,
        jobs: [testJob]
      }
    });

    // Update job status
    const updatedJobs = testStore.getState().jobData.jobs.map(job => 
      job.id === testJob.id ? { ...job, status: 'completed' } : job
    );
    
    testStore.setState({
      jobData: {
        ...testStore.getState().jobData,
        jobs: updatedJobs
      }
    });

    const finalState = testStore.getState();
    const updatedJob = finalState.jobData.jobs.find(job => job.id === testJob.id);
    expect(updatedJob.status).toBe('completed');
  });
});
