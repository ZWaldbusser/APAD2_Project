export function authResponseError(status, step) {
  if (status === 429)
    return {
      title: "Too many attempts",
      message:
        "Please wait before trying again. No request will be retried automatically.",
    };
  if (status >= 500)
    return {
      title: `${step} unavailable`,
      message:
        "The authentication service is temporarily unavailable. Please try again later.",
    };
  if (step === "Login" && [400, 401, 403].includes(status))
    return {
      title: "Credentials not accepted",
      message: "Check your username and password, then try again.",
    };
  if (step === "Registration" && status === 409)
    return {
      title: "Username taken",
      message:
        "That username is already in use. Choose another or log in to your existing account.",
    };
  if (step === "Verification" && [401, 403, 409].includes(status))
    return {
      title: "Code not accepted",
      message:
        "Use a fresh code from your authenticator app. If your login session expired, go back and log in again.",
    };
  return {
    title: `${step} could not be completed`,
    message:
      "Please check the information and try again. If this continues, go back and log in again.",
  };
}

export const hasToken = (value) =>
  typeof value === "string" && value.trim().length > 0;
