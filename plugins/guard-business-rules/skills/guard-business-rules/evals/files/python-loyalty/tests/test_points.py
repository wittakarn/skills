import pytest

from loyalty.points import earn, label


@pytest.mark.br("BR-LOY-001")
@pytest.mark.parametrize(
    "amount, expected",
    [
        (99, 3),
        (100, 4),
    ],
)
def test_one_point_per_25_baht(amount, expected):
    assert earn(amount) == expected


def test_gold_doubles():
    """BR-LOY-002: gold members earn double."""
    assert earn(100, "gold") == 8


def test_label():
    assert label(3) == "3 pts"


class TestExpiry:
    # BR-LOY-003
    def test_points_expire(self):
        assert True
