import os

css_path = "public/app.css"

with open(css_path, "r", encoding="utf-8") as f:
    content = f.read()

# Reemplazar la paleta root por una charcoal (gris super oscuro sin rastro de azul)
root_old = """:root {
  --bg-color: #0B192C; /* Deep Navy Blueprint */
  --surface-color: rgba(30, 62, 98, 0.4); /* Blueprint glass */
  --surface-border: rgba(255, 255, 255, 0.15);
  --primary-color: #E26A2C; /* Naranja Terracota Seguro (Ladrillo) */
  --primary-hover: #FF8243; /* Terracota Vibrante */
  --secondary-color: #D35400; /* Ladrillo Oscuro */
  --text-primary: #F0F4F8; /* Blueprint White */
  --text-secondary: #9BA4B5; /* Blueprint Slate */
  --danger-color: #E63946; 
  --success-color: #2A9D8F; 
  --font-family: 'Inter', sans-serif;
  --radius: 12px;
  --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}"""

root_new = """:root {
  --bg-color: #161618; /* Graphite Dark */
  --surface-color: rgba(35, 35, 38, 0.6); /* Grey Glass */
  --surface-border: rgba(255, 255, 255, 0.1);
  --primary-color: #E26A2C; /* Naranja Terracota */
  --primary-hover: #FF8243; 
  --secondary-color: #A04000; 
  --text-primary: #EDEDED; 
  --text-secondary: #A0A0A0; 
  --danger-color: #E63946; 
  --success-color: #2A9D8F; 
  --font-family: 'Inter', sans-serif;
  --radius: 12px;
  --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}"""

content = content.replace(root_old, root_new)

# Reemplazar azules quemados ("quemados en codigo duro")
content = content.replace("rgba(15, 23, 42", "rgba(35, 35, 38")
content = content.replace("rgba(99, 102, 241", "rgba(226, 106, 44")
content = content.replace("#a5b4fc", "#FF8243")

with open(css_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Exito")
