"""Tests for deterministic blood compatibility utilities."""

from __future__ import annotations

import pytest

from app.services.blood_compatibility import (
    explain_can_recipient_receive_from_donor,
    explain_who_can_donate_to,
    get_compatible_donor_blood_types,
    is_donor_compatible_with_recipient,
    is_valid_blood_type,
    normalize_blood_type,
)


class TestNormalizeBloodType:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("O-", "O-"),
            ("o negative", "O-"),
            ("A+", "A+"),
            ("a positive", "A+"),
            ("AB-", "AB-"),
            ("invalid", None),
        ],
    )
    def test_normalize(self, raw, expected):
        assert normalize_blood_type(raw) == expected


class TestCompatibilityRules:
    def test_o_negative_recipient_only_o_negative_donor(self):
        assert get_compatible_donor_blood_types("O-") == ("O-",)

    def test_o_negative_cannot_receive_o_positive(self):
        assert not is_donor_compatible_with_recipient("O+", "O-")

    def test_a_positive_compatible_donors(self):
        donors = get_compatible_donor_blood_types("A+")
        assert set(donors) == {"A+", "A-", "O+", "O-"}

    def test_ab_positive_universal_recipient_donors(self):
        donors = get_compatible_donor_blood_types("AB+")
        assert len(donors) == 8

    def test_invalid_type(self):
        assert get_compatible_donor_blood_types("XYZ") == ()
        assert not is_valid_blood_type("XYZ")


class TestCompatibilityExplanations:
    def test_can_receive_pair(self):
        answer = explain_can_recipient_receive_from_donor("O-", "O+")
        assert answer.valid
        assert answer.compatible is False

    def test_who_can_donate_to_a_positive(self):
        answer = explain_who_can_donate_to("A+")
        assert answer.valid
        assert "A+" in answer.compatible_donors
        assert "O-" in answer.compatible_donors
        assert answer.disclaimer

    def test_invalid_blood_type_message(self):
        answer = explain_who_can_donate_to("not-a-type")
        assert not answer.valid
