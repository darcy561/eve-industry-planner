import { useState, useEffect } from "react";
import { eventEmitter } from "../../../utils/EventSystem";
import { LOGIN_STEPS } from "../../../Events/loginEvents";

/**
 * Auth-scoped login progress state.
 */
export function useLoginState() {
  const [completedSteps, setCompletedSteps] = useState(new Set());
  const [error, setError] = useState(null);
  const [currentStep, setCurrentStep] = useState(null);
  const [userData, setUserData] = useState({
    eveLoginComplete: false,
    userArray: [],
  });

  useEffect(() => {
    const handleStepComplete = ({ step }) => {
      setCompletedSteps((prev) => new Set([...prev, step]));
      setCurrentStep(step);
      setError(null);
    };

    const handleLoginError = (step, incomingError) => {
      setError({ step, message: incomingError.message });
      setCurrentStep(step);
    };

    const handleLoginComplete = () => {
      setCompletedSteps(new Set(Object.values(LOGIN_STEPS)));
    };

    const handleUserDataUpdate = ({ userData: incomingUserData }) => {
      const incoming = incomingUserData.userArray ?? [];
      setUserData((prev) => {
        const seen = new Set();
        const merged = [];
        for (const user of [...prev.userArray, ...incoming]) {
          const id = user?.CharacterID;
          if (id == null || Number.isNaN(id)) continue;
          if (seen.has(id)) continue;
          seen.add(id);
          merged.push(user);
        }

        return {
          ...prev,
          eveLoginComplete: incomingUserData.eveLoginComplete,
          userArray: merged,
        };
      });
    };

    eventEmitter.on("loginStepComplete", handleStepComplete);
    eventEmitter.on("loginError", handleLoginError);
    eventEmitter.on("loginComplete", handleLoginComplete);
    eventEmitter.on("userDataUpdate", handleUserDataUpdate);

    return () => {
      eventEmitter.off("loginStepComplete", handleStepComplete);
      eventEmitter.off("loginError", handleLoginError);
      eventEmitter.off("loginComplete", handleLoginComplete);
      eventEmitter.off("userDataUpdate", handleUserDataUpdate);
    };
  }, []);

  const isStepComplete = (step) => completedSteps.has(step);
  const isLoginComplete = () =>
    Object.values(LOGIN_STEPS).every((step) => completedSteps.has(step));

  return {
    completedSteps,
    currentStep,
    error,
    userData,
    isStepComplete,
    isLoginComplete,
  };
}
