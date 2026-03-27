import { BasePage } from "./base-page.js";
import { firebaseAuth } from "../services/firebase-auth.js";

class BrispacePage extends BasePage {
  constructor() {
    super({ requiresAuth: false });
  }

  async onReady() {
    await firebaseAuth.init();
  }
}

export { BrispacePage };
