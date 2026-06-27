import os, pytest
from backend.parser import parse_pedimento

SAMPLE_PDF = os.path.join(os.path.dirname(__file__), "..", "6000505 PAGADO.pdf")
HAVE_SAMPLE = os.path.exists(SAMPLE_PDF)


@pytest.mark.skipif(not HAVE_SAMPLE, reason="sample PDF not present")
class TestSamplePDF:
    @pytest.fixture(scope="class")
    def result(self):
        return parse_pedimento(SAMPLE_PDF)

    def test_pedimento_num(self, result):
        assert "6000505" in result["pedimento_num"]

    def test_importador(self, result):
        assert "CARLOS" in result["importador"]

    def test_total_partidas(self, result):
        assert len(result["partidas"]) == 56

    def test_first_partida(self, result):
        p = result["partidas"][0]
        assert p["sec"] == 1
        assert p["fraccion"] == "76151002"
        assert p["cantidad"] == 2.0
        assert p["val_aduana"] == 699
        assert p["val_comercial"] == 694
        assert p["tiene_incrementables"] is True
        assert round(p["precio_unitario"], 1) == 349.5

    def test_multiline_description(self, result):
        p2 = result["partidas"][1]
        assert "KARAT" in p2["descripcion"]
        assert p2["sec"] == 2

    def test_page_break_partida(self, result):
        p4 = result["partidas"][3]
        assert p4["sec"] == 4
        assert p4["val_aduana"] == 699
        assert "KARAT" in p4["descripcion"]

    def test_incrementables_flag(self, result):
        for p in result["partidas"]:
            assert p["tiene_incrementables"] == (p["val_aduana"] != p["val_comercial"])

    def test_precio_unitario_formula(self, result):
        for p in result["partidas"]:
            expected = round(p["val_aduana"] / p["cantidad"], 5)
            assert p["precio_unitario"] == expected

    def test_last_partida(self, result):
        p = result["partidas"][-1]
        assert p["sec"] == 56
