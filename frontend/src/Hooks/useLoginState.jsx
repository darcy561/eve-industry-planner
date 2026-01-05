import { useState, useEffect } from 'react';
import { eventEmitter } from '../utils/EventSystem';
import { LOGIN_STEPS } from '../Events/loginEvents';

/**
 * Custom hook that manages the login state and tracks progress through the EVE Online SSO login process
 * 
 * This hook:
 * - Listens to login-related events from the event system
 * - Tracks completed login steps
 * - Manages current step and error states
 * - Stores user data as it becomes available
 * - Provides utility functions to check step completion and overall login status
 * 
 * @returns {Object} Object containing:
 *   - completedSteps: Set of completed login steps
 *   - currentStep: Currently active login step
 *   - error: Error object with step and message if login fails
 *   - userData: Object containing eveLoginComplete status and userArray
 *   - isStepComplete: Function to check if a specific step is complete
 *   - isLoginComplete: Function to check if all login steps are complete
 * 
 * @example
 * function LoginComponent() {
 *   const { 
 *     completedSteps, 
 *     currentStep, 
 *     error, 
 *     userData, 
 *     isStepComplete, 
 *     isLoginComplete 
 *   } = useLoginState();
 * 
 *   if (isLoginComplete()) {
 *     return <div>Login successful!</div>;
 *   }
 * 
 *   return <div>Current step: {currentStep}</div>;
 * }
 */
export function useLoginState() {
  const [completedSteps, setCompletedSteps] = useState(new Set());
  const [error, setError] = useState(null);
  const [currentStep, setCurrentStep] = useState(null);
  const [userData, setUserData] = useState({
    eveLoginComplete: false,
    userArray: []
  });

  useEffect(() => {
    const handleStepComplete = ({ step }) => {
      setCompletedSteps(prev => new Set([...prev, step]));
      setCurrentStep(step);
      setError(null);
    };

    const handleLoginError = (step, error) => {
      setError({ step, message: error.message });
      setCurrentStep(step);
    };

    const handleLoginComplete = () => {
      setCompletedSteps(new Set(Object.values(LOGIN_STEPS)));
    };

    const handleUserDataUpdate = ({ userData }) => {
      setUserData(prev => ({
        ...prev,
        eveLoginComplete: userData.eveLoginComplete,
        userArray: [...prev.userArray, ...userData.userArray]
      }));
    };

    eventEmitter.on('loginStepComplete', handleStepComplete);
    eventEmitter.on('loginError', handleLoginError);
    eventEmitter.on('loginComplete', handleLoginComplete);
    eventEmitter.on('userDataUpdate', handleUserDataUpdate);

    return () => {
      eventEmitter.off('loginStepComplete', handleStepComplete);
      eventEmitter.off('loginError', handleLoginError);
      eventEmitter.off('loginComplete', handleLoginComplete);
      eventEmitter.off('userDataUpdate', handleUserDataUpdate);
    };
  }, []);

  const isStepComplete = (step) => completedSteps.has(step);
  const isLoginComplete = () => Object.values(LOGIN_STEPS).every(step => completedSteps.has(step));

  return {
    completedSteps,
    currentStep,
    error,
    userData,
    isStepComplete,
    isLoginComplete
  };
} 