// dialog-chains.js
// Central registry for dialog chain definitions and their completion handlers

import { appState } from "../app.js";
import { toE164Format } from "../utils/phone-format.js";
import { revealScam } from "./scam-reveal.js";

export const dialogChains = {
  // Scam car giveaway chain
  scam: {
    steps: [
      {
        type: "alert",
        title: "Congratulations!",
        text: "Don't worry this definitely isn't a scam. Just go through this process and that car is yours!",
      },
      {
        type: "prompt",
        title: "Phone number",
        text: "Please enter your phone number so we can contact you about your new car!",
        inputMode: "phone",
        inputType: "tel",
        placeholder: "(555) 555-5555",
        default: "",
        validate: async function (val) {
          try {
            if (typeof val !== "string") return false;
            const enteredDigits = (val || "").replace(/\D/g, "");
            if (enteredDigits.length !== 10) return false;
            const enteredE164 = `+1${enteredDigits}`;

            const currentUser = appState.getCurrentUser();
            let myPhone =
              currentUser?.phone_number || localStorage.getItem("phone_number") || "";
            const myDigits = (myPhone || "").replace(/\D/g, "");
            let myE164 = null;
            if (myDigits.length === 11 && myDigits.startsWith("1")) {
              myE164 = `+1${myDigits.slice(1)}`;
            } else if (myDigits.length === 10) {
              myE164 = `+1${myDigits}`;
            } else {
              try {
                myE164 = toE164Format(myPhone);
              } catch (e) {
                return false;
              }
            }

            return enteredE164 === myE164;
          } catch (e) {
            return false;
          }
        },
        validationFailed: {
          title: "Incorrect Number",
          text: "Trying to give us a fake phone number, huh? Well guess who isn't getting a car. It's you.",
          closeText: "Close",
        },
      },
      {
        type: "prompt",
        title: "You sure you want this car?",
        text: "So here we'll just need your Social Security Number to ensure you are a US Citizen and eligible for this giveaway.",
        default: "",
        validate: function (val) {
          if (typeof val !== "string") return false;
          const digits = (val || "").replace(/\D/g, "");
          return digits.length === 9;
        },
        validationFailed: {
          title: "Probably Smart",
          text: "I mean really, was asking for an SSN just a little too much? Anyway, you're probably smart to be cautious about sharing that info. No car for you, but at least your identity is safe!",
          closeText: "Close",
        },
      },
      {
        type: "prompt",
        title: "Set Password",
        text: "I guess that *could* be your real SSN. Now, Enter a password. Your most-used one is fine, we're sure it's very secure.",
        default: "",
        validate: function (val) {
          const COMMON_PASSWORDS = [
            "123456", "password", "123456789", "12345678", "12345", "1234567",
            "qwerty", "abc123", "football", "monkey", "letmein", "696969",
            "shadow", "master", "666666", "qwertyuiop", "123321", "mustang",
            "1234567890", "michael", "superman", "batman", "dragon", "pass",
            "iloveyou", "trustno1", "sunshine", "princess", "welcome", "admin",
            "login", "starwars", "solo", "passw0rd", "whatever", "donald",
            "password1", "qazwsx", "zxcvbnm", "hunter2", "baseball", "access",
            "hello", "charlie", "august2020", "cheese", "thomas", "liverpool",
            "seahawks", "nicole",
          ];
          if (typeof val !== "string") return false;
          if (val.length < 7) return false;
          if (COMMON_PASSWORDS.includes(val.toLowerCase())) return false;
          return true;
        },
        validationFailed: {
          title: "Seriously?",
          text: "Whoa! That password is really not good. I can't believe you would use that. And you use that everywhere? Yikes. Your data has to already be compromised, so no real point in continuing this farce.",
          closeText: "Close",
        },
      },
      {
        type: "prompt",
        title: "One last thing...",
        text: "Last step! Let's setup your password reminder. Who is your best friend?",
        default: "",
        validate: function (val) {
          if (typeof val !== "string") return false;
          const v = (val || "").trim().toLowerCase();
          return v === "brian" || v === "brian cama";
        },
        validationFailed: {
          title: "Appease my Ego!",
          text: "Well, that answer doesn't seem quite right to me. If you can't tell the truth about your best friend, how can I trust you with a car?",
          closeText: "Close",
        },
      },
      {
        type: "confirm",
        title: "Proceed?",
        text: "Oh my goodness. *I'M* your best friend. You really didn't have to say that. Well you've completed all I asked for: Are you ready for your brand new car!!!",
        okText: "FREE CAR!",
        cancelText: "NO THANKS, I HATE CARS",
      },
    ],
    onComplete: async () => {
      await revealScam();
    },
  },
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
