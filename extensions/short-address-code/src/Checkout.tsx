import { render } from "preact";
import { useEffect, useRef, useState, useMemo, useCallback } from "preact/hooks";
import {
  useShippingAddress,
  useBuyerJourneyIntercept,
  useBuyerJourneyCompleted,
  useApi,
  useTranslate,
  useApplyShippingAddressChange,
} from "@shopify/ui-extensions/checkout/preact";
import type { ShippingAddress } from "@shopify/ui-extensions/checkout";


export default function extension() {
  render(<Extension />, document.body);
}


type Status = "idle" | "loading" | "applied" | "error";
type ErrorKind =
  | "none"
  | "no_address"
  | "apply_failed"
  | "system"
  | "shortcode_not_in_address";


type ComparableAddress = Pick<
  ShippingAddress,
  "countryCode" | "company" | "address1" | "address2" | "city" | "zip"
>;


type CacheEntry = {
  data: any;
  timestamp: number;
  address: ComparableAddress;
};


function getElapsed(startTime: number): string {
  return `${(Date.now() - startTime).toFixed(0)}ms`;
}


function normalize(v?: string | null) {
  return (v ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}


function diffAddress(
  current: ComparableAddress,
  next: ComparableAddress,
): Partial<ShippingAddress> {
  const patch: Partial<ShippingAddress> = {};

  (["countryCode", "company", "address1", "address2", "city", "zip"] as const).forEach(
    (k) => {
      const currentVal = current[k];
      const nextVal = next[k];

      if (normalize(currentVal as any) !== normalize(nextVal as any)) {
        (patch as any)[k] = nextVal;
      }
    },
  );

  return patch;
}


function getLast4Digits(companyValue?: string | null): string | null {
  if (!companyValue) return null;
  const trimmed = companyValue.trim();
  if (trimmed.length < 4) return null;
  return trimmed.slice(-4);
}


function isLast4DigitsInAddress(
  companyValue?: string | null,
  address1Value?: string | null,
): boolean {
  const last4 = getLast4Digits(companyValue);
  if (!last4) return false;
  const normalizedAddress = normalize(address1Value);
  return normalizedAddress.includes(last4.toLowerCase());
}


function doesCachedAddressMatchCompany(
  cachedAddress: ComparableAddress,
  currentCompany?: string | null,
): boolean {
  if (!currentCompany || !cachedAddress.company) return false;
  return normalize(cachedAddress.company) === normalize(currentCompany);
}


function Extension() {
  const renderStartTime = Date.now();
  const shippingAddress = useShippingAddress();
  const api = useApi();
  const { i18n } = api;
  const applyShippingAddressChange = useApplyShippingAddressChange();
  const translate = useTranslate();
  const buyerJourneyCompleted = useBuyerJourneyCompleted();

  // --- STATE ---
  const [status, setStatus] = useState<Status>("idle");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<ErrorKind>("none");
  const [isApplying, setIsApplying] = useState(false);

  const API_BASE_URL = "https://shortcode.medicaloutfit.com";

  // --- REFS ---
  const inFlightRef = useRef(false);
  const ignoreNextAddressEchoRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAppliedShortcodeRef = useRef<string | null>(null);
  const lastAppliedApiAddressRef = useRef<ComparableAddress | null>(null);
  const lastProcessedAddressRef = useRef<string | null>(null);
  
  const previousCompanyRef = useRef<string | null>(null);
  const wasBlockedRef = useRef(false);
  // ✅ NEW: Recovery mode flag - allows interceptor to pass through during recovery
  const isRecoveringRef = useRef(false);

  const componentMountedRef = useRef(false);
  const firstValidShortcodeProcessedRef = useRef(false);
  const initialMountTimeRef = useRef<number | null>(null);

  // --- CACHE ---
  const addressCacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const CACHE_DURATION = 5 * 60 * 1000;

  const getFromCache = (shortcode: string): CacheEntry | null => {
    const entry = addressCacheRef.current.get(shortcode);
    if (!entry) {
      return null;
    }
    if (Date.now() - entry.timestamp > CACHE_DURATION) {
      addressCacheRef.current.delete(shortcode);
      return null;
    }
    return entry;
  };

  const setToCache = (shortcode: string, data: any, address: ComparableAddress) => {
    
    addressCacheRef.current.set(shortcode, {
      data,
      timestamp: Date.now(),
      address,
    });

    if (addressCacheRef.current.size > 100) {
      const entries = Array.from(addressCacheRef.current.entries());
      entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
      addressCacheRef.current = new Map(entries.slice(0, 50));
    }
  };

  const clearCacheEntry = (shortcode: string) => {
    
    addressCacheRef.current.delete(shortcode);
  };

  // --- MEMOIZED DERIVED DATA ---
  const derivedData = useMemo(() => {
    const countryCode = shippingAddress?.countryCode;
    const companyRaw = shippingAddress?.company ?? "";
    const shortAddress = companyRaw.trim();
    const shortcodePattern = /^[A-Z]{4}[0-9]{4}$/;
    const isShortcodeWellFormed = shortcodePattern.test(shortAddress);
    const fullAddressKey = `${countryCode ?? ""}|${shortAddress}|${
      shippingAddress?.address1 ?? ""
    }|${shippingAddress?.address2 ?? ""}|${shippingAddress?.city ?? ""}|${
      shippingAddress?.zip ?? ""
    }`;

    return {
      countryCode,
      shortAddress,
      isShortcodeWellFormed,
      fullAddressKey,
    };
  }, [
    shippingAddress?.countryCode,
    shippingAddress?.company,
    shippingAddress?.address1,
    shippingAddress?.address2,
    shippingAddress?.city,
    shippingAddress?.zip,
  ]);


  // --- MOUNT EFFECT ---
  useEffect(() => {
    const mountStartTime = Date.now();
    componentMountedRef.current = true;
    initialMountTimeRef.current = Date.now();

    return () => {
      console.log(" ");
    };
  }, []);

  // --- SAFE APPLY ADDRESS WRAPPER ---
  async function safeApplyAddressChange(
    shortcode: string,
    apiAddress: ComparableAddress,
    patch: Partial<ShippingAddress>,
  ) {
    const applyStartTime = Date.now();
    

    if (buyerJourneyCompleted) {
      return { type: "skipped" as const };
    }


    setIsApplying(true);
    ignoreNextAddressEchoRef.current = true;
    
    // ✅ CRITICAL: Enter recovery mode to allow interceptor to pass
    isRecoveringRef.current = true;

    try {
      const apiCallStartTime = Date.now();
      const result = await applyShippingAddressChange({
        type: "updateShippingAddress",
        address: patch,
      });

      if (result?.type === "error") {
        setStatus("error");
        setValidationError(translate("applyFailed", { defaultValue: "Failed to update address. Please try again." }));
        setErrorKind("apply_failed");
        ignoreNextAddressEchoRef.current = false;
        isRecoveringRef.current = false;
        clearCacheEntry(shortcode);
        return result;
      }

      lastAppliedShortcodeRef.current = shortcode;
      lastAppliedApiAddressRef.current = apiAddress;
      setStatus("applied");
      setValidationError(null);
      setErrorKind("none");
      wasBlockedRef.current = false;

      if (!firstValidShortcodeProcessedRef.current) {
        firstValidShortcodeProcessedRef.current = true;
      }

      return result;
    } finally {
      setIsApplying(false);
      // ✅ Exit recovery mode after a short delay to ensure address echo completes
      setTimeout(() => {
        isRecoveringRef.current = false;
      }, 100);
    }
  }

  // --- CORE LOGIC ---
  async function fetchAndValidateAndApply(shortcode: string) {
    const totalStartTime = Date.now();

    if (buyerJourneyCompleted) {
      return;
    }

    if (inFlightRef.current) {
      return;
    }

    // ✅ Clear errors immediately when starting new validation
    setValidationError(null);
    setErrorKind("none");
    setStatus("loading"); // Set to loading immediately

    // 1. Regex Validation
    const shortcodePattern = /^[A-Z]{4}[0-9]{4}$/;
    if (!shortcodePattern.test(shortcode)) {
      setStatus("idle");
      return;
    }

    // 2. Skip if already applied AND company field matches
    if (
      lastAppliedShortcodeRef.current === shortcode &&
      lastAppliedApiAddressRef.current
    ) {
      if (!doesCachedAddressMatchCompany(lastAppliedApiAddressRef.current, shippingAddress?.company)) {
        lastAppliedShortcodeRef.current = null;
        lastAppliedApiAddressRef.current = null;
      } else {
        const currentSnapshot: ComparableAddress = {
          countryCode: shippingAddress?.countryCode,
          company: shippingAddress?.company ?? undefined,
          address1: shippingAddress?.address1 ?? undefined,
          address2: shippingAddress?.address2 ?? undefined,
          city: shippingAddress?.city ?? undefined,
          zip: shippingAddress?.zip ?? undefined,
        };

        const patch = diffAddress(currentSnapshot, lastAppliedApiAddressRef.current);

        if (
          Object.keys(patch).length === 0 ||
          (Object.keys(patch).length === 1 && (patch as any).address1 !== undefined)
        ) {
          setStatus("applied");
          return;
        }
      }
    }

    // 3. Cache Check with Company Validation
    const cached = getFromCache(shortcode);
    if (cached) {
      if (!doesCachedAddressMatchCompany(cached.address, shippingAddress?.company)) {
      
        clearCacheEntry(shortcode);
      } else {
        const currentSnapshot: ComparableAddress = {
          countryCode: shippingAddress?.countryCode,
          company: shippingAddress?.company ?? undefined,
          address1: shippingAddress?.address1 ?? undefined,
          address2: shippingAddress?.address2 ?? undefined,
          city: shippingAddress?.city ?? undefined,
          zip: shippingAddress?.zip ?? undefined,
        };

        const patch = diffAddress(currentSnapshot, cached.address);

        if (Object.keys(patch).length === 0) {
          
          lastAppliedShortcodeRef.current = shortcode;
          lastAppliedApiAddressRef.current = cached.address;
          setStatus("applied");

          if (!firstValidShortcodeProcessedRef.current) {
            firstValidShortcodeProcessedRef.current = true;
            
          }
          return;
        }

        
        inFlightRef.current = true;

        try {
          await safeApplyAddressChange(shortcode, cached.address, patch);
        } finally {
          inFlightRef.current = false;
        }
        return;
      }
    }

    // 4. API Call
    inFlightRef.current = true;

    const apiStartTime = Date.now();
    try {
      const url = `${API_BASE_URL}/national-address?shortaddress=${encodeURIComponent(shortcode)}`;
      

      const fetchStartTime = Date.now();
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
      });
      

      const text = await response.text();
      if (text.startsWith("<")) throw new Error("API returned HTML");
      const data = JSON.parse(text);

      const first = data?.data?.Addresses?.[0];

      if (!data?.success || !first) {
        setStatus("error");
        setErrorKind("no_address");
        setValidationError(translate("noAddressFound"));
        wasBlockedRef.current = true; // ✅ Set blocked state
        return;
      }


      const apiAddress: ComparableAddress = {
        countryCode: "SA",
        company: shortcode,
        address1: `${first.BuildingNumber || ""} ${first.Street || ""}`.trim(),
        address2: first.District || "",
        city: first.City || "",
        zip: first.PostCode || "",
      };

      setToCache(shortcode, data, apiAddress);

      const currentSnapshot: ComparableAddress = {
        countryCode: shippingAddress?.countryCode,
        company: shippingAddress?.company ?? undefined,
        address1: shippingAddress?.address1 ?? undefined,
        address2: shippingAddress?.address2 ?? undefined,
        city: shippingAddress?.city ?? undefined,
        zip: shippingAddress?.zip ?? undefined,
      };

      const patch = diffAddress(currentSnapshot, apiAddress);

      if (Object.keys(patch).length === 0) {
        lastAppliedShortcodeRef.current = shortcode;
        lastAppliedApiAddressRef.current = apiAddress;
        setStatus("applied");

        if (!firstValidShortcodeProcessedRef.current) {
          firstValidShortcodeProcessedRef.current = true;
        }
        return;
      }

      if (buyerJourneyCompleted) {
        return;
      }

      await safeApplyAddressChange(shortcode, apiAddress, patch);
      
    } catch (e) {
     
      setStatus("error");
      setErrorKind("system");
      setValidationError(
        translate("systemError", {
          defaultValue:
            "An error occurred while validating the address. Please try again.",
        }),
      );
      wasBlockedRef.current = true; // ✅ Set blocked state
      ignoreNextAddressEchoRef.current = false;
    } finally {
      inFlightRef.current = false;
      
    }
  }

  // ✅ NEW: Separate effect to watch ONLY company changes (no other deps)
  useEffect(() => {
    const currentCompany = derivedData.shortAddress;
    
    // Skip on initial mount
    if (previousCompanyRef.current === null) {
      previousCompanyRef.current = currentCompany;
      return;
    }
    
    // Detect company change
    if (previousCompanyRef.current !== currentCompany) {
      
      
      // Clear the lastProcessedAddressRef to allow reprocessing
      lastProcessedAddressRef.current = null;
      
      // Clear errors and blocked state
      if (wasBlockedRef.current || status === "error") {
       
        setStatus("idle");
        setValidationError(null);
        setErrorKind("none");
        wasBlockedRef.current = false;
      }
      
      // Update tracking
      previousCompanyRef.current = currentCompany;
      
      // ✅ IMMEDIATE validation (no debounce) for company changes during error
      if (
        derivedData.countryCode === "SA" &&
        derivedData.isShortcodeWellFormed
      ) {
        
        fetchAndValidateAndApply(currentCompany);
      }
    } else {
      previousCompanyRef.current = currentCompany;
    }
  }, [derivedData.shortAddress]); // ✅ Only watch company changes

  // --- EFFECT: DEBOUNCE WATCHER (for non-company changes) ---
  useEffect(() => {
    const effectStartTime = Date.now();


    // 1. Echo cancellation
    if (ignoreNextAddressEchoRef.current) {
      
      ignoreNextAddressEchoRef.current = false;
      return;
    }

    // 2. Prerequisites
    if (
      derivedData.countryCode !== "SA" ||
      !derivedData.shortAddress ||
      !derivedData.isShortcodeWellFormed
    ) {
      
      setStatus("idle");
      setValidationError(null);
      setErrorKind("none");
      wasBlockedRef.current = false;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      return;
    }

    // 3. Data unchanged check
    if (lastProcessedAddressRef.current === derivedData.fullAddressKey) {
      
      return;
    }

    // 4. Timer for non-company changes only
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const delay = !firstValidShortcodeProcessedRef.current ? 3000 : 6000;
   

    debounceTimerRef.current = setTimeout(() => {
      const timerFireTime = Date.now();
     
      lastProcessedAddressRef.current = derivedData.fullAddressKey;
      fetchAndValidateAndApply(derivedData.shortAddress);
    }, delay);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [
    derivedData.fullAddressKey,
    derivedData.countryCode,
    derivedData.isShortcodeWellFormed,
  ]); // ✅ Removed status from deps

  // --- INTERCEPTOR: BLOCK JOURNEY ---
  const interceptorLogic = useMemo(() => {
    const shouldValidate =
      derivedData.countryCode === "SA" && derivedData.isShortcodeWellFormed;

    // ✅ CRITICAL: Allow progress if in recovery mode
    if (isRecoveringRef.current) {

      return { behavior: "allow" as const };
    }

    // Block if applying
    if (isApplying) {
      return {
        behavior: "block" as const,
        reason: "address_change_in_progress",
        errors: [{ message: translate("validatingAddress") }],
      };
    }

    // Block if loading
    if (shouldValidate && status === "loading") {
      return {
        behavior: "block" as const,
        reason: "validation_in_progress",
        errors: [{ message: translate("validatingAddress") }],
      };
    }

    // Block if no address error
    if (
      shouldValidate &&
      status === "error" &&
      errorKind === "no_address" &&
      validationError
    ) {
      return {
        behavior: "block" as const,
        reason: "invalid_national_address_shortcode",
        errors: [
          {
            message: validationError,
            target: "$.cart.deliveryGroups[0].deliveryAddress.company",
          },
        ],
      };
    }

    // Block if system error
    if (
      shouldValidate &&
      status === "error" &&
      errorKind === "system" &&
      validationError
    ) {
      return {
        behavior: "block" as const,
        reason: "system_validation_error",
        errors: [
          {
            message: validationError,
            target: "$.cart.deliveryGroups[0].deliveryAddress.company",
          },
        ],
      };
    }

    // Block if last 4 digits not in address
    if (shouldValidate && status === "applied") {
      const last4InAddress = isLast4DigitsInAddress(
        shippingAddress?.company,
        shippingAddress?.address1,
      );

      if (!last4InAddress) {
        return {
          behavior: "block" as const,
          reason: "shortcode_last_4_not_in_address",
          errors: [
            {
              message: translate("shortcodeNotInAddress"),
              target: "$.cart.deliveryGroups[0].deliveryAddress.address1",
            },
           
          ],
        };
      }
    }

    // Allow progress
    return { behavior: "allow" as const };
  }, [
    derivedData.countryCode,
    derivedData.isShortcodeWellFormed,
    isApplying,
    status,
    errorKind,
    validationError,
    shippingAddress?.company,
    shippingAddress?.address1,
    translate,
  ]);

  useBuyerJourneyIntercept(({ canBlockProgress }) => {
    const interceptStartTime = Date.now();
  

    if (!canBlockProgress) {
     
      return { behavior: "allow" as const };
    }

    return interceptorLogic;
  });

  
  return null;
}
