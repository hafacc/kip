"use client";

import { type ReactElement, useId } from "react";
import { CHECKOUT_MAX } from "../utils/checkout";
import FieldNote from "./ui/field-note";
import { Textarea } from "./ui/input";

/** The check-out instructions field, shared by the place form and the room sheet. */
export default function CheckoutField({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}): ReactElement {
  const fieldId = useId();
  return (
    <label
      htmlFor={fieldId}
      className="flex flex-col gap-1.5 text-sm text-muted"
    >
      Check-out instructions
      <Textarea
        id={fieldId}
        className="min-h-24 resize-y text-text"
        maxLength={CHECKOUT_MAX}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldNote>Only guests with a confirmed stay see this.</FieldNote>
    </label>
  );
}
