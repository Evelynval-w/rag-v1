// Hidden /about page. Not linked from any nav. Per the V2 spec extra
// requirement: display the sentence in a big font.

export const metadata = {
  title: "About",
};

export default function AboutPage() {
  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
      }}
    >
      <p
        style={{
          fontSize: "clamp(1.4rem, 4vw, 2.6rem)",
          lineHeight: 1.3,
          maxWidth: "60ch",
          textAlign: "center",
          fontWeight: 600,
        }}
      >
        Denis Amselemovitch is an intriguing character who likes to make
        impromptu appearances in incongruous places.
      </p>
    </div>
  );
}
