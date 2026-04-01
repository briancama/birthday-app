import { BasePage } from "./base-page.js";
import { firebaseAuth } from "../services/firebase-auth.js";

class AdminPage extends BasePage {
  constructor() {
    super({ requiresAuth: false });
  }

  async onReady() {
    this.setPageTitle("Admin");
    await firebaseAuth.init();
  }
}

export { AdminPage };
