
//   // @ts-check

//   const COMPANY_PATTERN = /^[A-Z]{4}\d{4}$/;

//   /**
//    * Validate short address (company) matches pattern AAAA1111
//    * @param {string} value
//    */
//   function isValidCompany(value) {
//     return COMPANY_PATTERN.test((value || "").toString().trim());
//   }

//   /**
//    * Translation helper - loads appropriate locale based on buyer language
//    * @param {string} locale - raw locale, e.g., "ar", "en", "en-US", "ar-SA"
//    * @param {"shortAddressRequired" | "invalidShortAddressFormat" | "addressNotAssociatedWithShortCode"} key - translation key
//    */
//   function translate(locale, key) {
//     /** @type {const} */
//     const translations = {
//       en: {
//         shortAddressRequired:
//           "Based on the new shipping regulation, please make sure that you enter the national address shortcode correctly to complete your order. This helps deliver your shipment smoothly and without any delays. You can find the shortcode in the National Address Certificate.",
//         invalidShortAddressFormat:
//           "Invalid Short Address Code format. Please enter a valid code.",
//         addressNotAssociatedWithShortCode:"No national address is associated with this shortcode. Please verify your address."
//       },
//       ar: {
//         shortAddressRequired:
//           "بناءً على تنظيم الشحن الجديد، يرجى التأكد من إدخال الرمز المختصر للعنوان الوطني بشكل صحيح لإتمام طلبك. يساعد ذلك في توصيل شحنتك بسلاسة وبدون أي تأخير. يمكنك العثور على الرمز المختصر في شهادة العنوان الوطني.",
//         invalidShortAddressFormat:
//           "تنسيق رمز العنوان القصير غير صحيح. يرجى إدخال رمز صحيح.",
//         addressNotAssociatedWithShortCode:"لا يوجد عنوان وطني مرتبط بهذا الرمز القصير. يرجى التحقق من عنوانك.",

//       },
//     };

//     // Normalize incoming locale to our supported set: 'en' | 'ar'
//     // Handles cases like 'en', 'en-US', 'ar', 'ar-SA'
//     const lower = (locale || "").toLowerCase();

//     /** @type {keyof typeof translations} */
//     const lang = lower.startsWith("ar") ? "ar" : "en";

//     // TypeScript now knows lang is 'en' | 'ar'
//     return translations[lang][key];
//   }

//   /**
//    * @typedef {import("../generated/api").CartValidationsGenerateRunInput} RunInput
//    * @typedef {import("../generated/api").CartValidationsGenerateRunResult} RunResult
//    */

//   /**
//    * The configured entrypoint for the 'cart.validations.generate.run' extension target.
//    * @param {RunInput} input
//    * @returns {RunResult}
//    */
//   export function cartValidationsGenerateRun(input) {
//     /** @type {Array<{message: string; target: string}>} */
//     const errors = [];

//     const deliveryGroups = input?.cart?.deliveryGroups ?? [];

//     // Get buyer's locale from localization input (e.g. "en", "en-US", "ar", "ar-SA")
//     const buyerLocaleRaw =
//       input?.localization?.language?.isoCode?.toLowerCase() || "en";

//     for (let i = 0; i < deliveryGroups.length; i++) {
//       const addr = deliveryGroups[i]?.deliveryAddress;
//       if (!addr) continue;

//       const countryCode = (addr.countryCode ?? "")
//         .toString()
//         .trim()
//         .toUpperCase();
//       if (countryCode !== "SA") continue;

//       const company = (addr.company ?? "").toString().trim();
//       const address1 = (addr.address1 ?? "").toString().trim();

//       // 1) Short address (company) is required
//       if (!company) {
//         errors.push({
//           message: translate(buyerLocaleRaw, "shortAddressRequired"),
//           target: `$.cart.deliveryGroups[${i}].deliveryAddress.company`,
//         });
//         continue;
//       }

//       // 2) Short address must match pattern AAAA1111
//       if (!isValidCompany(company)) {
//         errors.push({
//           message: translate(buyerLocaleRaw, "invalidShortAddressFormat"),
//           target: `$.cart.deliveryGroups[${i}].deliveryAddress.company`,
//         });
//         continue;
//       }

//       // 3) Building number (last 4 digits of short code) must appear in address1
//       const buildingNumber = company.slice(-4);

// // allow only start/end or SPACE around the number
// const exactMatchRegex = new RegExp(`(^|\\s)${buildingNumber}(\\s|$)`);

// if (address1 && !exactMatchRegex.test(address1)) {
//   errors.push({
//     message: translate(buyerLocaleRaw, "addressNotAssociatedWithShortCode"),
//     target: `$.cart.deliveryGroups[${i}].deliveryAddress.address1`,
//   });
// }

//     }

//     if (errors.length === 0) {
//       return { operations: [] };
//     }

//     return {
//       operations: [
//         {
//           validationAdd: {
//             errors,
//           },
//         },
//       ],
//     };
//   }

// @ts-check


// @ts-check

const COMPANY_PATTERN = /^[A-Z]{4}\d{4}$/;

/**
 * Validate short address (company) matches pattern AAAA1111
 * @param {string} value
 */
function isValidCompany(value) {
  return COMPANY_PATTERN.test((value || "").toString().trim());
}

/**
 * Translation helper - loads appropriate locale based on buyer language
 * @param {string} locale - raw locale, e.g., "ar", "en", "en-US", "ar-SA"
 * @param {"shortAddressRequired" | "invalidShortAddressFormat" | "addressNotAssociatedWithShortCode"} key - translation key
 */
function translate(locale, key) {
  /** @type {const} */
  const translations = {
    en: {
      shortAddressRequired:
        "Based on the new shipping regulation, please make sure that you enter the national address shortcode correctly to complete your order. This helps deliver your shipment smoothly and without any delays. You can find the shortcode in the National Address Certificate.",
      invalidShortAddressFormat:
        "Invalid Short Address Code format. Please enter a valid code.",
      addressNotAssociatedWithShortCode:
        "No national address is associated with this shortcode. Please verify your address.",
    },
    ar: {
      shortAddressRequired:
        "بناءً على تنظيم الشحن الجديد، يرجى التأكد من إدخال الرمز المختصر للعنوان الوطني بشكل صحيح لإتمام طلبك. يساعد ذلك في توصيل شحنتك بسلاسة وبدون أي تأخير. يمكنك العثور على الرمز المختصر في شهادة العنوان الوطني.",
      invalidShortAddressFormat:
        "تنسيق رمز العنوان القصير غير صحيح. يرجى إدخال رمز صحيح.",
      addressNotAssociatedWithShortCode:
        "لا يوجد عنوان وطني مرتبط بهذا الرمز القصير. يرجى التحقق من عنوانك.",
    },
  };

  // Normalize incoming locale to our supported set: 'en' | 'ar'
  // Handles cases like 'en', 'en-US', 'ar', 'ar-SA'
  const lower = (locale || "").toLowerCase();

  /** @type {keyof typeof translations} */
  const lang = lower.startsWith("ar") ? "ar" : "en";

  return translations[lang][key];
}

/**
 * @typedef {import("../generated/api").CartValidationsGenerateRunInput} RunInput
 * @typedef {import("../generated/api").CartValidationsGenerateRunResult} RunResult
 */

/**
 * The configured entrypoint for the 'cart.validations.generate.run' extension target.
 * @param {RunInput} input
 * @returns {RunResult}
 */
export function cartValidationsGenerateRun(input) {
  // --- STRICT CHECKOUT-ONLY GUARD ---

  const step = input?.buyerJourney?.step;

  // step is one of:
  //  - 'CART_INTERACTION'
  //  - 'CHECKOUT_INTERACTION'
  //  - 'CHECKOUT_COMPLETION'
  //
  // We only want to validate during checkout, not while the customer is just
  // adding/removing items from the cart.
  const isCheckoutStep =
    step === 'CHECKOUT_INTERACTION' || step === 'CHECKOUT_COMPLETION';

  if (!isCheckoutStep) {
    // CartInteraction or unknown: don't block add to cart / cart updates
    return { operations: [] };
  }

  // --- YOUR ORIGINAL VALIDATION LOGIC ---

  /** @type {Array<{message: string; target: string}>} */
  const errors = [];

  const deliveryGroups = input?.cart?.deliveryGroups ?? [];

  // Get buyer's locale from localization input (e.g. "en", "en-US", "ar", "ar-SA")
  const buyerLocaleRaw =
    input?.localization?.language?.isoCode?.toLowerCase() || "en";

  for (let i = 0; i < deliveryGroups.length; i++) {
    const addr = deliveryGroups[i]?.deliveryAddress;
    if (!addr) continue;

    const countryCode = (addr.countryCode ?? "")
      .toString()
      .trim()
      .toUpperCase();
    if (countryCode !== "SA") continue;

    const company = (addr.company ?? "").toString().trim();
    const address1 = (addr.address1 ?? "").toString().trim();

    // 1) Short address (company) is required
    if (!company) {
      errors.push({
        message: translate(buyerLocaleRaw, "shortAddressRequired"),
        target: `$.cart.deliveryGroups[${i}].deliveryAddress.company`,
      });
      continue;
    }

    // 2) Short address must match pattern AAAA1111
    if (!isValidCompany(company)) {
      errors.push({
        message: translate(buyerLocaleRaw, "invalidShortAddressFormat"),
        target: `$.cart.deliveryGroups[${i}].deliveryAddress.company`,
      });
      continue;
    }

    // 3) Building number (last 4 digits of short code) must appear in address1
    const buildingNumber = company.slice(-4);

    // allow only start/end or SPACE around the number
    const exactMatchRegex = new RegExp(`(^|\\s)${buildingNumber}(\\s|$)`);

    if (address1 && !exactMatchRegex.test(address1)) {
      errors.push({
        message: translate(
          buyerLocaleRaw,
          "addressNotAssociatedWithShortCode",
        ),
        target: `$.cart.deliveryGroups[${i}].deliveryAddress.address1`,
      });
    }
  }

  if (errors.length === 0) {
    return { operations: [] };
  }

  return {
    operations: [
      {
        validationAdd: {
          errors,
        },
      },
    ],
  };
}