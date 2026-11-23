from __future__ import annotations

from rlsh_parser.parser import parse_hero_page


HTML = """
<html>
  <body>
    <h1 id="firstHeading">Night Beacon</h1>
    <div id="mw-content-text">
      <table class="infobox">
        <tr><th colspan="2">Night Beacon</th></tr>
        <tr><td><b>Hero</b></td><td>Night Beacon</td></tr>
        <tr><td><b>Alias(es)</b></td><td>Beacon, NB-01</td></tr>
        <tr><td><b>Location</b></td><td>New York, USA</td></tr>
        <tr><td colspan="2"><img src="https://example.org/img/hero.png" /></td></tr>
      </table>
      <p>Primary paragraph.</p>
      <h2>History</h2>
      <p>Second paragraph.</p>
    </div>
  </body>
</html>
"""


def test_parse_hero_page_extracts_expected_fields() -> None:
    result = parse_hero_page("https://wiki.rlsh.net/wiki/Night_Beacon", "https://wiki.rlsh.net/wiki/Night_Beacon", HTML)

    assert result.title == "Night Beacon"
    assert result.infobox["hero"] == "Night Beacon"
    assert result.infobox["aliases"] == "Beacon, NB-01"
    assert result.infobox["location"] == "New York, USA"
    assert result.infobox["image"] == "https://example.org/img/hero.png"
    assert "Primary paragraph." in result.page_text
    assert "History" in result.page_text
    assert "Second paragraph." in result.page_text


def test_parse_hero_page_handles_missing_content() -> None:
    result = parse_hero_page("a", "b", "<html><body><p>No wiki body</p></body></html>")

    assert result.title is None
    assert result.infobox == {}
    assert result.page_text == ""