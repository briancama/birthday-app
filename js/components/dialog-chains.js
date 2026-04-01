// dialog-chains.js
// Central registry for dialog chain definitions and their completion handlers

export const dialogChains = {
  // Example for forgot phone
  forgotPhone: {
    steps: [
      {
        type: "alert",
        title: "Wait, wait, are you serious?",
        text: "You forgot the phone number you used to sign up? That's... actually pretty impressive. If you are that forgetful you must be the founder of Brispace himself. Let's see if you can answer your security questions.",
      },
      {
        type: "prompt",
        title: "Security Question 1",
        text: "Don't remember filling these out? Well let's see if you can guess! What year were you born?",
        validate: function (val) {
          if (typeof val !== "string") return false;
          const v = (val || "").trim().toLowerCase();
          return v == "1986" || v == "nineteen eighty six" || v == "86";
        },
        validationFailed: {
          title: "Hey!",
          text: "First you can't remember your phone number and now you don't know a simple security question? Are you trying to steal my account?",
          closeText: "Close",
        },
      },
      {
        type: "prompt",
        title: "Security Question 2",
        text: "That was the easy one. Let's try another. In what city were youborn?",
        validate: function (val) {
          if (typeof val !== "string") return false;
          const v = (val || "").trim().toLowerCase();
          return (
            v === "honolulu" ||
            v === "honolulu, hi" ||
            v === "honolulu, hawaii" ||
            v === "honolulu, hi, usa" ||
            v === "honolulu, hawaii, usa"
          );
        },
        validationFailed: {
          title: "Nope!",
          text: "Not quite. Here's your awesome hint that will definitely help you out: the place where you were born.",
          closeText: "Close",
        },
      },
      {
        type: "prompt",
        title: "Security Question 3",
        text: "Okay this one's a toughie. What is the name of the elementary school you attended?",
        validate: function (val) {
          if (typeof val !== "string") return false;
          const v = (val || "").trim().toLowerCase();
          return (
            v == "1986" ||
            v === "kapiolani" ||
            v === "kapiolani elementary" ||
            v === "kapiolani elementary school" ||
            v === "kapiolani school" ||
            v === "chiefess kapiolani elementary school" ||
            v === "kapiʻolani" ||
            v === "kapiʻolani elementary" ||
            v === "kapiʻolani elementary school" ||
            v === "kapiʻolani school" ||
            v === "chiefess kapiʻolani elementary school"
          );
        },
        validationFailed: {
          title: "Are you sure you went to school?",
          text: "Ohhhhhhh... so close, but you'll need to try again Mr. Hacker. Here's a hint: Their school colors were turquoise and pink while you attended.",
          closeText: "Close",
        },
      },
      {
        type: "prompt",
        title: "Security Question 4",
        text: "Your last security question to recover your current phone number is: What was your home phone number when you were 18? ",
        validate: function (val) {
          if (typeof val !== "string") return false;
          const v = (val || "").trim().toLowerCase();
          return (
            v == "8089596409" ||
            v === "9596409" ||
            v === "959-6409" ||
            v === "959.6409" ||
            v === "(808)959-6409" ||
            v === "(808) 9596409" ||
            v === "(808) 959-6409" ||
            v === "808-959-6409" ||
            v === "808.959.6409"
          );
        },
        validationFailed: {
          title: "Diabolical!",
          text: "You made the final security question to recover your current phone number the phone number you had over 20 years ago? Insane!",
          closeText: "Close",
        },
      },
      {
        type: "confirm",
        title: "Welcome Back Brian!",
        text: "Wow. You’ve outsmarted your own security questions. Again. Click Admin to reclaim your account and try not to lock yourself out this time.",
        okText: "Admin",
        cancelText: "Actually, I don't want that responsibility.",
      },
    ],
    onComplete: () => {
      // Flag that the user completed the forgot-phone flow; checked on next login
      // to trigger the achievement and hide this link going forward.
      try {
        localStorage.setItem("brispace_forgot_flow", "1");
        window.location.href = "/admin";
      } catch (_) {}
    },
  },
};
